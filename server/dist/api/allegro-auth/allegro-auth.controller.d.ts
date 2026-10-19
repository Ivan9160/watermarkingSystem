import { AllegroAuthService } from './allegro-auth.service.ts';
export declare class AllegroAuthController {
    private readonly auth;
    constructor(auth: AllegroAuthService);
    login(): {
        url: string;
    };
    callback(code: string, state: string): Promise<any>;
    refresh(refreshToken: string): Promise<any>;
}
