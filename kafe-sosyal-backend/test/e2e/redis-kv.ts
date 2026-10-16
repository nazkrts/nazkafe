/**
 * RedisKvStore'un gerçek Redis'e karşı doğrulaması (birim testler bellek içi depoyu kullanır).
 * Çalıştırma: REDIS_URL=redis://localhost:6379 npm run test:redis
 */
import assert from 'node:assert/strict';
import Redis from 'ioredis';
import { RedisKvStore } from '../../src/kv/kv.store';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL tanımlı olmalı');
  const redis = new Redis(url);
  const kv = new RedisKvStore(redis);
  const p = `t:${Date.now()}:`;
  let n = 0;
  const step = async (name: string, fn: () => Promise<void>) => {
    await fn();
    n++;
    console.log('  ✓', name);
  };

  await step('set/get/del, TTL süresi dolunca anahtar düşer', async () => {
    await kv.set(p + 'a', 'x', 60);
    assert.equal(await kv.get(p + 'a'), 'x');
    assert.ok((await redis.ttl(p + 'a')) > 0);
    await kv.set(p + 'b', 'y', 1);
    await sleep(1300);
    assert.equal(await kv.get(p + 'b'), null);
    await kv.set(p + 'c', '1', 60);
    await kv.del(p + 'a', p + 'c');
    assert.equal(await kv.get(p + 'a'), null);
    assert.equal(await kv.get(p + 'c'), null);
    await kv.del();                                            // boş silme zararsız
  });

  await step('incr: sayaç artar, TTL yalnızca ilk artışta konur (pencere kayıp gitmez)', async () => {
    assert.equal(await kv.incr(p + 'n', 30), 1);
    const ttl1 = await redis.ttl(p + 'n');
    assert.ok(ttl1 > 0 && ttl1 <= 30);
    await sleep(1100);
    assert.equal(await kv.incr(p + 'n', 30), 2);
    assert.ok((await redis.ttl(p + 'n')) < ttl1);              // TTL sıfırlanmadı
  });

  await step('eşzamanlı incr: 50 çağrı → tam 50, tekrar yok', async () => {
    const res = await Promise.all(Array.from({ length: 50 }, () => kv.incr(p + 'race', 30)));
    assert.equal(new Set(res).size, 50);
    assert.equal(Math.max(...res), 50);
  });

  await step('küme: sadd/smembers/srem ve TTL', async () => {
    await kv.sadd(p + 's', 'a', 60);
    await kv.sadd(p + 's', 'b', 60);
    await kv.sadd(p + 's', 'a', 60);
    assert.deepEqual((await kv.smembers(p + 's')).sort(), ['a', 'b']);
    assert.ok((await redis.ttl(p + 's')) > 0);
    await kv.srem(p + 's', 'a');
    assert.deepEqual(await kv.smembers(p + 's'), ['b']);
  });

  await redis.del(p + 'n', p + 'race', p + 's');
  await redis.quit();
  console.log(`\nRedis KV: ${n} adım geçti`);
}

main().catch((err) => {
  console.error('BAŞARISIZ', err);
  process.exit(1);
});
