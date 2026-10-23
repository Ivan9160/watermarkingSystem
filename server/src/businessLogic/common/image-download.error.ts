export class ImageDownloadError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'ImageDownloadError';
  }
}
