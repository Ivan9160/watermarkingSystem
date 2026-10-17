import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import jwksRsa from "jwks-rsa";

interface Auth0JwtPayload {
  sub?: unknown;
  [claim: string]: unknown;
}

@Injectable()
export class Auth0JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor() {
    const domain = process.env["AUTH0_DOMAIN"];
    const audience = process.env["AUTH0_AUDIENCE"];

    if (!domain || !audience) {
      throw new Error(
        "Set AUTH0_DOMAIN and AUTH0_AUDIENCE in the server .env file before starting the app.",
      );
    }

    const normalizedDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      audience,
      issuer: `https://${normalizedDomain}/`,
      algorithms: ["RS256"],
      secretOrKeyProvider: jwksRsa.passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://${normalizedDomain}/.well-known/jwks.json`,
      }),
    });
  }

  validate(payload: Auth0JwtPayload): { sub: string } {
    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      throw new UnauthorizedException("Auth0 token has no valid sub claim");
    }

    return { sub: payload.sub };
  }
}
