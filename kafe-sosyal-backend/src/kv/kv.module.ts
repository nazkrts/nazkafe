import { Global, Logger, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { KV, KvStore, MemoryKvStore, RedisKvStore } from './kv.store';

@Global()
@Module({
  providers: [
    {
      provide: KV,
      inject: [APP_CONFIG],
      useFactory: (cfg: AppConfig): KvStore => {
        if (cfg.redisUrl) return new RedisKvStore(new Redis(cfg.redisUrl));
        new Logger('Kv').warn('REDIS_URL boş: bellek içi depo kullanılıyor (yalnızca geliştirme için).');
        return new MemoryKvStore();
      },
    },
  ],
  exports: [KV],
})
export class KvModule {}
