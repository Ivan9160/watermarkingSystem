export const IMAGE_DOWNLOAD_QUEUE = 'image-download';
export const IMAGE_PROCESS_QUEUE = 'image-process';

export interface ImageTaskPayload {
  imageJobId: string;
}
