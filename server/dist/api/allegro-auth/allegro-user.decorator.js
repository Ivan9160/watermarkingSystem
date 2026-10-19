import { createParamDecorator } from "@nestjs/common";
export const AllegroUser = createParamDecorator((_data, ctx) => ctx.switchToHttp().getRequest().allegroUser);
//# sourceMappingURL=allegro-user.decorator.js.map