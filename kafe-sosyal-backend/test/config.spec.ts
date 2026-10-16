import assert from 'node:assert/strict';
import { loadConfig } from '../src/config/app-config';

const base = {
  DATABASE_URL: 'postgres://x',
  JWT_SECRET: 'j'.repeat(40),
  PHONE_PEPPER: 'p'.repeat(20),
  DATA_ENC_KEY: Buffer.alloc(32, 1).toString('base64'),
};

describe('yapılandırma', () => {
  it('geçerli ortam yüklenir, varsayılanlar uygulanır', () => {
    const c = loadConfig({ ...base });
    assert.equal(c.checkinHours, 3);
    assert.equal(c.qrWindowSeconds, 300);
    assert.equal(c.likeLimitPerCheckin, 15);
    assert.equal(c.minAge, 18);
    assert.equal(c.requireApprovedPhoto, false);
    assert.equal(c.dataEncKey.length, 32);
  });

  it('zorunlu değişken eksikse veya zayıfsa hata verir', () => {
    assert.throws(() => loadConfig({ ...base, JWT_SECRET: undefined }));
    assert.throws(() => loadConfig({ ...base, JWT_SECRET: 'kisa' }));
    assert.throws(() => loadConfig({ ...base, PHONE_PEPPER: 'kisa' }));
    assert.throws(() => loadConfig({ ...base, DATA_ENC_KEY: 'AAAA' }));
    assert.throws(() => loadConfig({ ...base, DATABASE_URL: undefined }));
  });

  it('check-in süresi veritabanı sınırını (3 saat) aşamaz; yaş 18 altına inemez', () => {
    assert.throws(() => loadConfig({ ...base, CHECKIN_HOURS: '4' }));
    assert.throws(() => loadConfig({ ...base, MIN_AGE: '17' }));
    assert.equal(loadConfig({ ...base, CHECKIN_HOURS: '2' }).checkinHours, 2);
  });

  it('production: Redis zorunlu, örnek anahtarlar yasak, fotoğraf şartı varsayılan açık', () => {
    assert.throws(() => loadConfig({ ...base, NODE_ENV: 'production' }));
    const ok = loadConfig({ ...base, NODE_ENV: 'production', REDIS_URL: 'redis://r' });
    assert.equal(ok.requireApprovedPhoto, true);
    assert.throws(() =>
      loadConfig({ ...base, NODE_ENV: 'production', REDIS_URL: 'redis://r', JWT_SECRET: 'gelistirme-' + 'x'.repeat(30) }),
    );
    assert.throws(() =>
      loadConfig({
        ...base,
        NODE_ENV: 'production',
        REDIS_URL: 'redis://r',
        DATA_ENC_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
      }),
    );
  });

  it('geçersiz sayısal değerler hata verir', () => {
    assert.throws(() => loadConfig({ ...base, PORT: 'abc' }));
    assert.throws(() => loadConfig({ ...base, LIKE_LIMIT_PER_CHECKIN: '0' }));
  });
});
