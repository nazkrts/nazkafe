import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { JwtAuthGuard } from './auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ConsoleOtpSender, OTP_SENDER, UnconfiguredOtpSender } from './otp-sender';
import { TokensService } from './tokens.service';

/** Global: diğer modüller JwtAuthGuard ve TokensService'i ayrıca import etmeden kullanır. */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (cfg: AppConfig) => ({ secret: cfg.jwtSecret, signOptions: { algorithm: 'HS256' } }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokensService,
    JwtAuthGuard,
    {
      provide: OTP_SENDER,
      inject: [APP_CONFIG],
      useFactory: (cfg: AppConfig) => (cfg.isProd ? new UnconfiguredOtpSender() : new ConsoleOtpSender()),
    },
  ],
  exports: [JwtModule, JwtAuthGuard, TokensService],
})
export class AuthModule {}
