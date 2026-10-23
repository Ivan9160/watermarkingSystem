export abstract class StorageService {
  abstract upload(key: string, buffer: Buffer, contentType: string): Promise<void>;
  abstract uploadFile(key: string, filePath: string, contentType: string): Promise<void>;
  abstract downloadToFile(key: string, filePath: string): Promise<void>;
  abstract getDownloadUrl(key: string): Promise<string>;
  abstract remove(key: string): Promise<void>;
}