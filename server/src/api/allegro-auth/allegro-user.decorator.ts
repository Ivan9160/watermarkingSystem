import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

export interface AllegroUserInfo {
  id: number;
  token: string;
}

export const AllegroUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AllegroUserInfo =>
    ctx.switchToHttp().getRequest().allegroUser,
);