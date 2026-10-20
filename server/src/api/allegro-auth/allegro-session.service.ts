import {
  BadGatewayException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { AllegroAuthService } from './allegro-auth.service.ts';

export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}
interface AllegroUser {
  id: string | number;
  login: string;
}
interface AllegroSession {
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt: number;
  sessionExpiresAt: number;
  sellerName: string;
  sellerId: string;
}
interface OfferSummary {
  id: string;
  name: string;
  primaryImage?: { url?: string };
}
interface OfferPage {
  offers: OfferSummary[];
  totalCount?: number;
}
interface OfferDetails {
  id: string;
  name?: string;
  images?: Array<string | { url?: string }>;
}
export interface LibraryImage {
  id: string;
  filename: string;
  src: string;
  productName: string;
  source: 'allegro';
}

const PAGE_SIZE = 100;
const CONCURRENT_DETAILS = 3;

@Injectable()
export class AllegroSessionService {
  private readonly sessions = new Map<string, AllegroSession>();

  constructor(
    private readonly auth: AllegroAuthService,
    private readonly config: ConfigService,
  ) {}

  createSession(tokens: TokenResponse, user: AllegroUser): string {
    const id = randomBytes(32).toString('hex');
    const now = Date.now();
    this.sessions.set(id, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt: now + Math.max(60, tokens.expires_in || 3600) * 1000,
      sessionExpiresAt: now + SESSION_MAX_AGE_MS,
      sellerName: user.login,
      sellerId: String(user.id),
    });
    return id;
  }

  getStatus(id: string | undefined) {
    const session = this.getSession(id);
    return session
      ? { connected: true, sellerName: session.sellerName }
      : { connected: false };
  }

  disconnect(id: string | undefined): void {
    if (id) this.sessions.delete(id);
  }

  async getImages(id: string | undefined) {
    const session = this.getSession(id);
    if (!session) throw new UnauthorizedException('Connect Allegro first');

    const offers: OfferSummary[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const url = new URL('/sale/offers', this.config.getOrThrow<string>('ALLEGRO_API_URL'));
      url.searchParams.set('limit', String(PAGE_SIZE));
      url.searchParams.set('offset', String(offset));
      const page = await this.getJson<OfferPage>(session, url);
      const chunk = page.offers ?? [];
      offers.push(...chunk);
      if (chunk.length < PAGE_SIZE || (typeof page.totalCount === 'number' && offers.length >= page.totalCount)) {
        break;
      }
    }

    const items: LibraryImage[] = [];
    let failedOffers = 0;
    const failedOfferIds: string[] = [];

    for (let start = 0; start < offers.length; start += CONCURRENT_DETAILS) {
      const chunk = offers.slice(start, start + CONCURRENT_DETAILS);
      const results = await Promise.allSettled(chunk.map(async (offer) => {
        const url = new URL(
          `/sale/product-offers/${encodeURIComponent(offer.id)}`,
          this.config.getOrThrow<string>('ALLEGRO_API_URL'),
        );
        const details = await this.getJson<OfferDetails>(session, url);
        const images: LibraryImage[] = [];
        for (const [index, entry] of (details.images ?? []).entries()) {
          const sourceUrl = typeof entry === 'string' ? entry : entry?.url;
          if (!sourceUrl || !this.isHttpsImageUrl(sourceUrl)) continue;
          images.push({
            id: `allegro-${session.sellerId}-${offer.id}-${index}`,
            filename: `${offer.id}-${String(index + 1).padStart(2, '0')}.jpg`,
            src: sourceUrl,
            productName: details.name ?? offer.name,
            source: 'allegro',
          });
        }
        return images;
      }));

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          items.push(...result.value);
        } else {
          failedOffers++;
          if (failedOfferIds.length < 10) failedOfferIds.push(chunk[index].id);
        }
      });
    }

    if (failedOffers === offers.length && offers.length > 0) {
      throw new BadGatewayException('Unable to load details for any Allegro offer');
    }

    return {
      items,
      offerCount: offers.length,
      failedOffers,
      failedOfferIds,
    };
  }

  private isHttpsImageUrl(value: string): boolean {
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }

  private async getJson<T>(session: AllegroSession, url: URL): Promise<T> {
    await this.ensureValidAccessToken(session);
    for (let attempt = 0; attempt < 4; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            Accept: 'application/vnd.allegro.public.v1+json',
            'User-Agent': 'WaterM/0.3.0 (local development)',
          },
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        if (attempt === 3) throw new BadGatewayException('Allegro API is unavailable');
        await this.delay(750 * (attempt + 1));
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        throw new UnauthorizedException('Allegro access was denied; reconnect your account');
      }
      if ((response.status === 429 || response.status >= 500) && attempt < 3) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 10_000)
          : 1000 * (attempt + 1);
        await this.delay(delayMs);
        continue;
      }
      if (!response.ok) throw new BadGatewayException(`Allegro API error: ${response.status}`);
      return response.json() as Promise<T>;
    }
    throw new BadGatewayException('Allegro API retries exhausted');
  }

  private async ensureValidAccessToken(session: AllegroSession) {
    if (Date.now() <= session.tokenExpiresAt - 60_000) return;
    if (!session.refreshToken) throw new UnauthorizedException('Please reconnect Allegro');
    const updated = (await this.auth.refresh(session.refreshToken)) as TokenResponse;
    session.accessToken = updated.access_token;
    session.refreshToken = updated.refresh_token ?? session.refreshToken;
    session.tokenExpiresAt = Date.now() + Math.max(60, updated.expires_in || 3600) * 1000;
  }

  private delay(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  private getSession(id: string | undefined): AllegroSession | undefined {
    if (!id) return undefined;
    const session = this.sessions.get(id);
    if (!session) return undefined;
    if (Date.now() >= session.sessionExpiresAt) {
      this.sessions.delete(id);
      return undefined;
    }
    return session;
  }
}
