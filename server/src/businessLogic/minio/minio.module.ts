import { Module } from '@nestjs/common';
import { MinioStorageService } from './minio-storage.service.ts';

@Module({
  providers: [MinioStorageService],
  exports: [MinioStorageService],
})
export class MinioModule {}
