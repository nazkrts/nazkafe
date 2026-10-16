import Redis from 'ioredis';

export const KV = Symbol('KV');

/** Geçici veriler için küçük anahtar-değer arayüzü: OTP, hız sınırı, refresh token. */
export interface KvStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  /** Sayacı artırır; ilk oluşturulduğunda TTL koyar. Yeni değeri döner. */
  incr(key: string, ttlSec: number): Promise<number>;
  sadd(key: string, member: string, ttlSec: number): Promise<void>;
  smembers(key: string): Promise<string[]>;
  srem(key: string, member: string): Promise<void>;
}

/** Hız sınırı: `limit` aşılmadıysa true. */
export async function allow(kv: KvStore, key: string, limit: number, windowSec: number): Promise<boolean> {
  return (await kv.incr(key, windowSec)) <= limit;
}

interface Entry {
  value: string | Set<string>;
  expiresAt: number;
}

/** Geliştirme ve testler için bellek içi depo. Süreç yeniden başlayınca silinir; production'da kullanılmaz. */
export class MemoryKvStore implements KvStore {
  private readonly data = new Map<string, Entry>();

  constructor(private readonly now: () => number = Date.now) {}

  private live(key: string): Entry | undefined {
    const e = this.data.get(key);
    if (e && e.expiresAt <= this.now()) {
      this.data.delete(key);
      return undefined;
    }
    return e;
  }

  async get(key: string): Promise<string | null> {
    const e = this.live(key);
    return typeof e?.value === 'string' ? e.value : null;
  }

  async set(key: string, value: string, ttlSec: number): Promise<void> {
    this.data.set(key, { value, expiresAt: this.now() + ttlSec * 1000 });
  }

  async del(...keys: string[]): Promise<void> {
    for (const k of keys) this.data.delete(k);
  }

  async incr(key: string, ttlSec: number): Promise<number> {
    const e = this.live(key);
    if (!e) {
      this.data.set(key, { value: '1', expiresAt: this.now() + ttlSec * 1000 });
      return 1;
    }
    const n = Number(e.value) + 1;
    e.value = String(n);
    return n;
  }

  async sadd(key: string, member: string, ttlSec: number): Promise<void> {
    const e = this.live(key);
    const set = e && e.value instanceof Set ? e.value : new Set<string>();
    set.add(member);
    this.data.set(key, { value: set, expiresAt: this.now() + ttlSec * 1000 });
  }

  async smembers(key: string): Promise<string[]> {
    const e = this.live(key);
    return e && e.value instanceof Set ? [...e.value] : [];
  }

  async srem(key: string, member: string): Promise<void> {
    const e = this.live(key);
    if (e && e.value instanceof Set) e.value.delete(member);
  }
}

const INCR_SCRIPT =
  "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end; return n";

export class RedisKvStore implements KvStore {
  constructor(private readonly redis: Redis) {}

  get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSec: number): Promise<void> {
    await this.redis.set(key, value, 'EX', ttlSec);
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length) await this.redis.del(...keys);
  }

  async incr(key: string, ttlSec: number): Promise<number> {
    return Number(await this.redis.eval(INCR_SCRIPT, 1, key, ttlSec));
  }

  async sadd(key: string, member: string, ttlSec: number): Promise<void> {
    await this.redis.multi().sadd(key, member).expire(key, ttlSec).exec();
  }

  smembers(key: string): Promise<string[]> {
    return this.redis.smembers(key);
  }

  async srem(key: string, member: string): Promise<void> {
    await this.redis.srem(key, member);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
