import assert from 'node:assert/strict';
import { allow, MemoryKvStore } from '../src/kv/kv.store';

describe('bellek içi KV deposu', () => {
  let t = 1_000_000;
  const kv = new MemoryKvStore(() => t);
  beforeEach(() => {
    t = 1_000_000;
  });

  it('set/get ve süre dolumu', async () => {
    await kv.set('a', '1', 10);
    assert.equal(await kv.get('a'), '1');
    t += 9_999;
    assert.equal(await kv.get('a'), '1');
    t += 2;
    assert.equal(await kv.get('a'), null);
  });

  it('del', async () => {
    await kv.set('b', '1', 10);
    await kv.del('b', 'yok');
    assert.equal(await kv.get('b'), null);
  });

  it('incr ilk çağrıda TTL koyar, pencere bitince sıfırlanır', async () => {
    assert.equal(await kv.incr('c', 60), 1);
    assert.equal(await kv.incr('c', 60), 2);
    t += 61_000;
    assert.equal(await kv.incr('c', 60), 1);
  });

  it('allow: limit aşılınca false', async () => {
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await allow(kv, 'rl', 3, 60));
    assert.deepEqual(results, [true, true, true, false, false]);
  });

  it('küme işlemleri', async () => {
    await kv.sadd('s', 'x', 10);
    await kv.sadd('s', 'y', 10);
    await kv.sadd('s', 'x', 10);
    assert.deepEqual((await kv.smembers('s')).sort(), ['x', 'y']);
    await kv.srem('s', 'x');
    assert.deepEqual(await kv.smembers('s'), ['y']);
    t += 11_000;
    assert.deepEqual(await kv.smembers('s'), []);
  });
});
