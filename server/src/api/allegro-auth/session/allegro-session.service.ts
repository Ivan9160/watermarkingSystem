import {
  BadGatewayException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { AllegroAuthService } from '../allegro-auth.service.ts';

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
  offerId: string;
  source: 'allegro';
}

export interface AllegroImportResult {
  items: LibraryImage[];
  offerCount: number;
  failedOffers: number;
  failedOfferIds: string[];
}

export type AllegroImportStage =
  | 'idle'
  | 'fetching-offers'
  | 'fetching-images'
  | 'completed'
  | 'failed';

export interface AllegroImportProgress {
  stage: AllegroImportStage;
  totalOffers: number | null;
  processedOffers: number;
  importedImages: number;
  failedOffers: number;
  error?: string;
}

interface AllegroImportJob {
  progress: AllegroImportProgress;
  result?: AllegroImportResult;
}

interface AllegroSession {
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt: number;
  sessionExpiresAt: number;
  sellerName: string;
  sellerId: string;
  importJob?: AllegroImportJob;
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

  startImport(id: string | undefined): AllegroImportProgress {
    const session = this.requireSession(id);
    const current = session.importJob;

    if (
      current?.progress.stage === 'fetching-offers' ||
      current?.progress.stage === 'fetching-images'
    ) {
      return { ...current.progress };
    }

    const progress: AllegroImportProgress = {
      stage: 'fetching-offers',
      totalOffers: null,
      processedOffers: 0,
      importedImages: 0,
      failedOffers: 0,
    };

    const job: AllegroImportJob = { progress };
    session.importJob = job;

    void this.collectImages(session, progress)
      .then((result) => {
        if (session.importJob !== job) return;
        job.result = result;
        progress.stage = 'completed';
      })
      .catch((error: unknown) => {
        if (session.importJob !== job) return;
        progress.stage = 'failed';
        progress.error = error instanceof Error
          ? error.message
          : 'Could not import images from Allegro';
      });

    return { ...progress };
  }

  getImportProgress(id: string | undefined): AllegroImportProgress {
    const session = this.requireSession(id);
    return session.importJob
      ? { ...session.importJob.progress }
      : {
          stage: 'idle',
          totalOffers: null,
          processedOffers: 0,
          importedImages: 0,
          failedOffers: 0,
        };
  }

  async getImages(id: string | undefined): Promise<AllegroImportResult> {
    const session = this.requireSession(id);
    const job = session.importJob;

    if (job?.result) return job.result;
    if (
      job?.progress.stage === 'fetching-offers' ||
      job?.progress.stage === 'fetching-images'
    ) {
      throw new ConflictException('Allegro import is still running');
    }

    return this.collectImages(session);
  }

  private async collectImages(
    session: AllegroSession,
    progress?: AllegroImportProgress,
  ): Promise<AllegroImportResult> {
    const offers: OfferSummary[] = [];

    for (let offset = 0; ; offset += PAGE_SIZE) {
      const url = new URL(
        '/sale/offers',
        this.config.getOrThrow<string>('ALLEGRO_API_URL'),
      );
      url.searchParams.set('limit', String(PAGE_SIZE));
      url.searchParams.set('offset', String(offset));

      const page = await this.getJson<OfferPage>(session, url);
      const chunk = page.offers ?? [];
      offers.push(...chunk);

      if (progress && typeof page.totalCount === 'number') {
        progress.totalOffers = page.totalCount;
      }

      if (
        chunk.length < PAGE_SIZE ||
        (typeof page.totalCount === 'number' && offers.length >= page.totalCount)
      ) {
        break;
      }
    }

    if (progress) {
      progress.totalOffers = offers.length;
      progress.stage = 'fetching-images';
    }

    const items: LibraryImage[] = [];
    let failedOffers = 0;
    const failedOfferIds: string[] = [];

    for (let start = 0; start < offers.length; start += CONCURRENT_DETAILS) {
      const chunk = offers.slice(start, start + CONCURRENT_DETAILS);
      const results = await Promise.allSettled(
        chunk.map(async (offer) => {
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
              offerId: offer.id,
              source: 'allegro',
            });
          }
          return images;
        }),
      );

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          items.push(...result.value);
        } else {
          failedOffers++;
          if (failedOfferIds.length < 10) {
            failedOfferIds.push(chunk[index].id);
          }
        }
      });

      if (progress) {
        progress.processedOffers += chunk.length;
        progress.importedImages = items.length;
        progress.failedOffers = failedOffers;
      }
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

  private requireSession(id: string | undefined): AllegroSession {
    const session = this.getSession(id);
    if (!session) throw new UnauthorizedException('Connect Allegro first');
    return session;
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
            'User-Agent': 'WaterM/0.4.0 (local development)',
          },
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        if (attempt === 3) {
          throw new BadGatewayException('Allegro API is unavailable');
        }
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

      if (!response.ok) {
        throw new BadGatewayException(`Allegro API error: ${response.status}`);
      }
      return response.json() as Promise<T>;
    }

    throw new BadGatewayException('Allegro API retries exhausted');
  }

  private async ensureValidAccessToken(session: AllegroSession) {
    if (Date.now() <= session.tokenExpiresAt - 60_000) return;
    if (!session.refreshToken) {
      throw new UnauthorizedException('Please reconnect Allegro');
    }

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


  async getAuthContext(id: string | undefined) {
    const session = this.requireSession(id);
    await this.ensureValidAccessToken(session);
    return {
      allegroUserId: Number(session.sellerId),
      sellerName: session.sellerName,
      accessToken: session.accessToken,
    };
  }
}
