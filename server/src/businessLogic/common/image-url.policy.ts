import { ImageDownloadError } from './image-download.error.ts';


export function parseAllowedImageUrl(sourceUrl: string): URL {
  let url: URL;

  try {
    url = new URL(sourceUrl);
  } catch {
    throw new ImageDownloadError('Invalid image URL');
  }

  //uncomment the following lines in production

  

  // if (url.protocol !== 'https:' || url.username || url.password) {
  //   throw new ImageDownloadError(
  //     'Image URLs must use HTTPS and cannot contain credentials',
  //   );
  // }

  // const allowedHosts = (
  //   process.env['IMAGE_URL_ALLOWED_HOSTS'] ?? 'a.allegroimg.allegrosandbox.pl'
  // )
  //   .split(',')
  //   .map((host) => host.trim().toLowerCase())
  //   .filter(Boolean);

  // const hostname = url.hostname.toLowerCase();

  // if (!allowedHosts.some((h) => hostname === h || hostname.endsWith(`.${h}`))) {
  //   throw new ImageDownloadError('Image host is not allowed');
  // }

  return url;
}
