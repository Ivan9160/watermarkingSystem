import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { Auth0JwtStrategy } from "./auth0-jwt.strategy";

@Module({
  imports: [PassportModule.register({ defaultStrategy: "jwt" })],
  providers: [Auth0JwtStrategy],
  exports: [PassportModule],
})
export class AuthModule {}
