import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AllegroSessionService } from './allegro-session.service.ts';

import {
  SESSION_COOKIE,
} from './auth.constants.ts';

type RequestWithAllegroSession = Request & {
  allegroSessionId?: string;
};

function getCookie(
  req: Request,
  name: string,
): string | undefined {
  const entry = req.headers.cookie
    ?.split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`));

  return entry?.slice(name.length + 1);
}

@Injectable()
export class AllegroSessionGuard implements CanActivate {
  constructor(
    private readonly sessions: AllegroSessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req =
      ctx.switchToHttp().getRequest<RequestWithAllegroSession>();

    const sessionId = getCookie(req, SESSION_COOKIE);

    if (!sessionId) {
      throw new UnauthorizedException(
        'Allegro session cookie is required',
      );
    }

    try {
      const status = await this.sessions.getStatus(sessionId);

      if (!status?.connected) {
        throw new UnauthorizedException(
          'Invalid or expired Allegro session',
        );
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException(
        'Invalid or expired Allegro session',
      );
    }

    req.allegroSessionId = sessionId;
    return true;
  }
}