import { BadGatewayException, Injectable } from '@nestjs/common';
import { Agent } from 'http';

const API = process.env.ALLEGRO_API_URL ?? 'https://api.allegro.pl.allegrosandbox.pl';
const UPLOAD = process.env.ALLEGRO_UPLOAD_URL ?? 'https://upload.allegro.pl.allegrosandbox.pl';
const MEDIA = 'application/vnd.allegro.public.v1+json';

@Injectable()
export class AllegroOffersClient {
  private async request<T>(
    url: string,
    init: RequestInit,
    token: string,
    contentType: string = MEDIA,
  ): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: MEDIA,
        'Content-Type': contentType,
        
      },
    });
    if (!res.ok) {
    throw new BadGatewayException(
        `Allegro ${res.status} ${init.method ?? 'GET'} ${url}: ${await res.text()}`,
    );
    }
    return (await res.json()) as T;
  }

  async uploadImage(
  token: string,
  body: ArrayBuffer,
  contentType: string,
): Promise<string> {
  const data = await this.request<{ location: string }>(
    `${UPLOAD}/sale/images`,
    { method: 'POST', body },
    token,
    contentType,
  );
  return data.location;
}

  async getOfferImageUrls(token: string, offerId: string): Promise<string[]> {
    const offer = await this.request<{ images: Array<string | { url: string }> }>(
      `${API}/sale/product-offers/${offerId}`,
      { method: 'GET' },
      token,
    );
    return offer.images.map((i) => (typeof i === 'string' ? i : i.url));
  }

  async setOfferImages(token: string, offerId: string, images: string[]) {
    await this.request(
      `${API}/sale/product-offers/${offerId}`,
      { method: 'PATCH', body: JSON.stringify({ images }) },
      token,
    );
  }
}