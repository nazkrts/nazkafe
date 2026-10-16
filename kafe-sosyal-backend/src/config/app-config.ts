import { Global, Module } from '@nestjs/common';

export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppConfig {
  nodeEnv: string;
  isProd: boolean;
  port: number;
  databaseUrl: string;
  redisUrl?: string;
  jwtSecret: string;
  phonePepper: string;
  dataEncKey: Buffer;
  accessTtlSec: number;
  refreshTtlDays: number;
  qrWindowSeconds: number;
  checkinHours: number;
  likeLimitPerCheckin: number;
  minAge: number;
  timezone: string;
  /** true ise onaylı fotoğrafı olmayan kullanıcı görünür olamaz ve keşifte listelenmez */
  requireApprovedPhoto: boolean;
  /** Yerel fotoğraf deposu klasörü (production'da nesne depolama uygulamasına geçilir) */
  uploadDir: string;
}

const EXAMPLE_ENC_KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

function intVar(env: NodeJS.ProcessEnv, name: string, def: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${name} ${min}-${max} arasında bir tam sayı olmalı (verilen: ${raw})`);
  }
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const isProd = nodeEnv === 'production';
  const need = (name: string): string => {
    const v = env[name];
    if (!v) throw new Error(`${name} tanımlı olmalı`);
    return v;
  };

  const jwtSecret = need('JWT_SECRET');
  if (jwtSecret.length < 32) throw new Error('JWT_SECRET en az 32 karakter olmalı');
  const phonePepper = need('PHONE_PEPPER');
  if (phonePepper.length < 16) throw new Error('PHONE_PEPPER en az 16 karakter olmalı');
  const encKeyB64 = need('DATA_ENC_KEY');
  const dataEncKey = Buffer.from(encKeyB64, 'base64');
  if (dataEncKey.length !== 32) throw new Error('DATA_ENC_KEY base64 çözüldüğünde 32 bayt olmalı');

  const redisUrl = env.REDIS_URL || undefined;
  if (isProd) {
    if (!redisUrl) throw new Error('Production için REDIS_URL zorunlu');
    if (jwtSecret.includes('gelistirme') || phonePepper.includes('gelistirme') || encKeyB64 === EXAMPLE_ENC_KEY) {
      throw new Error('Production için .env.example içindeki örnek anahtarlar kullanılamaz');
    }
  }

  return {
    nodeEnv,
    isProd,
    port: intVar(env, 'PORT', 3000, 1, 65535),
    databaseUrl: need('DATABASE_URL'),
    redisUrl,
    jwtSecret,
    phonePepper,
    dataEncKey,
    accessTtlSec: intVar(env, 'ACCESS_TTL_SEC', 900, 60, 3600),
    refreshTtlDays: intVar(env, 'REFRESH_TTL_DAYS', 30, 1, 90),
    qrWindowSeconds: intVar(env, 'QR_WINDOW_SECONDS', 300, 60, 900),
    // Veritabanı kısıtı (max_3h) nedeniyle en fazla 3 saat
    checkinHours: intVar(env, 'CHECKIN_HOURS', 3, 1, 3),
    likeLimitPerCheckin: intVar(env, 'LIKE_LIMIT_PER_CHECKIN', 15, 1, 100),
    minAge: intVar(env, 'MIN_AGE', 18, 18, 99),
    timezone: env.APP_TIMEZONE || 'Europe/Istanbul',
    uploadDir: env.UPLOAD_DIR || './uploads',
    requireApprovedPhoto: (env.REQUIRE_APPROVED_PHOTO ?? (isProd ? 'true' : 'false')) === 'true',
  };
}

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => loadConfig() }],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
