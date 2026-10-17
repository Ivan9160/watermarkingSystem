import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import { db } from "./db.js";

@Injectable()
export class PrismaService implements OnApplicationShutdown {
  readonly orm = db.orm;

  async onApplicationShutdown(): Promise<void> {
    await db.close();
  }
}
