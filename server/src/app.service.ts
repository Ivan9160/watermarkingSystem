import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'This is a watermarking system server. Use the API to interact with it.';
  }
}