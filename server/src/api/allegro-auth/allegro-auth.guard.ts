// import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
// import { AllegroAuthService } from './allegro-auth.service.ts';
// @Injectable()
// export class AllegroAuthGuard implements CanActivate {
//   private readonly cache = new Map<string, { userId: number; exp: number }>();

//   constructor(private readonly allegro: AllegroAuthService) {}

//   async canActivate(ctx: ExecutionContext): Promise<boolean> {
//     const req = ctx.switchToHttp().getRequest();
//     const token = req.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
//     if (!token) throw new UnauthorizedException('Bearer token is required');

//     const hit = this.cache.get(token);
//     if (hit && hit.exp > Date.now()) {
//       req.allegroUser = { id: hit.userId, token };
//       return true;
//     }

//     let me;
//     try {
//       me = await this.allegro.getMe(token); 
//     } catch {
//       throw new UnauthorizedException('Invalid Allegro token');
//     }

//     const userId = Number(me.id);
//     this.cache.set(token, { userId, exp: Date.now() + 60_000 });
//     req.allegroUser = { id: userId, token };
//     return true;
//   }
// }




import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { AllegroSessionService } from './session/allegro-session.service.ts';
import { SESSION_COOKIE } from './session/auth.constants.ts';
import { getCookie } from './session/cookie.util.ts';

@Injectable()
export class AllegroAuthGuard implements CanActivate {
  constructor(private readonly sessions: AllegroSessionService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const sessionId = getCookie(req, SESSION_COOKIE);

    const auth = await this.sessions.getAuthContext(sessionId);

    req.allegroUser = { id: auth.allegroUserId, token: auth.accessToken };
    return true;
}
}