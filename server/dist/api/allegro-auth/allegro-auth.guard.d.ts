import { CanActivate, ExecutionContext } from '@nestjs/common';
import { AllegroAuthService } from './allegro-auth.service.ts';
export declare class AllegroAuthGuard implements CanActivate {
    private readonly allegro;
    private readonly cache;
    constructor(allegro: AllegroAuthService);
    canActivate(ctx: ExecutionContext): Promise<boolean>;
}
