import { ConfigService } from '@nestjs/config';
export declare class AllegroAuthService {
    private readonly config;
    private readonly states;
    constructor(config: ConfigService);
    buildAuthorizeUrl(): string;
    exchangeCode(code: string, state: string): Promise<any>;
    refresh(refreshToken: string): Promise<any>;
    getMe(accessToken: string): Promise<any>;
    private requestToken;
}
