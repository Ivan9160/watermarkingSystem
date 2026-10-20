import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';

@Injectable()
export class AllegroAuthService {
  private readonly states = new Set<string>(); 

  constructor(private readonly config: ConfigService) {}

  buildAuthorizeUrl(): string {
    const state = randomBytes(16).toString('hex');
    this.states.add(state);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.getOrThrow('ALLEGRO_CLIENT_ID'),
      redirect_uri: this.config.getOrThrow('ALLEGRO_REDIRECT_URI'),
      scope: this.config.getOrThrow('ALLEGRO_SCOPE'),
      state,
    });
    return `${this.config.getOrThrow('ALLEGRO_AUTH_URL')}?${params}`;
  }

  async exchangeCode(code: string, state: string) {
    if (!this.states.delete(state)) {
      throw new BadRequestException('Invalid state');
    }
    return this.requestToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.getOrThrow('ALLEGRO_REDIRECT_URI'),
    });
  }

  refresh(refreshToken: string) {
    return this.requestToken({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      redirect_uri: this.config.getOrThrow('ALLEGRO_REDIRECT_URI'),
    });
  }

  async getMe(accessToken: string) {
    const res = await fetch(`${this.config.getOrThrow('ALLEGRO_API_URL')}/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.allegro.public.v1+json',
      },
    });
    if (!res.ok) throw new BadRequestException(await res.text());
    return res.json(); 
  }

  private async requestToken(body: Record<string, string>) {
    const basic = Buffer.from(
      `${this.config.getOrThrow('ALLEGRO_CLIENT_ID')}:${this.config.getOrThrow('ALLEGRO_CLIENT_SECRET')}`,
    ).toString('base64');

    const res = await fetch(this.config.getOrThrow('ALLEGRO_TOKEN_URL'), {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(body),
    });
    if (!res.ok) throw new BadRequestException(await res.text());
    return res.json(); 
  }
}