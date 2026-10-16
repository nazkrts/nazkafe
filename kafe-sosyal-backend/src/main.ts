import 'reflect-metadata';
import { loadEnvFile } from './config/load-env';

loadEnvFile(); // diğer import'lardan önce: modüller process.env okuyabilsin

import { ValidationError, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AppError } from './common/errors';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { loadConfig } from './config/app-config';

/** İç içe nesnelerdeki (örn. consents[0].type) doğrulama mesajlarını da toplar. */
function collectMessages(errors: ValidationError[]): string[] {
  return errors.flatMap((e) => [...Object.values(e.constraints ?? {}), ...collectMessages(e.children ?? [])]);
}

async function bootstrap(): Promise<void> {
  const cfg = loadConfig(); // eksik/zayıf ayarlarda daha başlarken hata ver
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Fotoğraf yükleme ham gövde ile gelir (en fazla ~5 MB; servis ayrıca denetler)
  app.useBodyParser('raw', { type: ['image/jpeg', 'image/png'], limit: '6mb' });

  // Tersine vekil (nginx, yük dengeleyici) arkasındaysan, hız sınırı gerçek IP'yi görsün diye:
  // app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.setGlobalPrefix('v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) =>
        new AppError('VALIDATION_ERROR', collectMessages(errors).join('; ') || 'İstek geçersiz.', 422),
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  await app.listen(cfg.port);
}

void bootstrap();
