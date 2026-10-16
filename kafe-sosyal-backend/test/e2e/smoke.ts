/**
 * Duman testi: DERLENMİŞ uygulamayı (node dist/main.js) gerçek HTTP ile dener. Birim ve uçtan uca testlerin
 * kapsamadığı yeri doğrular: modül/DI bağlantıları, controller yönlendirmeleri, DTO doğrulaması, hata biçimi,
 * ham gövde (fotoğraf) ayrıştırıcısı, guard'lar.
 *
 * Ön koşul: migrate + seed yapılmış veritabanı, çalışan sunucu (günlüğü SERVER_LOG dosyasına yazılıyor),
 * ve iki hesap: `npm run cafe:create` ile demo kafe için SMOKE_CAFE_EMAIL, `npm run admin:create` ile SMOKE_ADMIN_EMAIL
 * (parolalar SMOKE_PASSWORD). Geliştirme modunda OTP kodu sunucu günlüğünden okunur.
 *   BASE_URL=http://localhost:3000/v1 SERVER_LOG=server.log SMOKE_PASSWORD=... npm run test:smoke
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeJpeg } from '../helpers/images';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000/v1';
const LOG = process.env.SERVER_LOG ?? 'server.log';
const PASSWORD = process.env.SMOKE_PASSWORD ?? '';
const CAFE_EMAIL = process.env.SMOKE_CAFE_EMAIL ?? 'smoke-cafe@example.com';
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL ?? 'smoke-admin@example.com';

interface Res {
  status: number;
  json: any;
  buf: Buffer;
  type: string;
}

async function call(method: string, path: string, opts: { token?: string; body?: unknown; raw?: Buffer; type?: string } = {}): Promise<Res> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  let body: Buffer | string | undefined;
  if (opts.raw) {
    headers['content-type'] = opts.type ?? 'application/octet-stream';
    body = opts.raw;
  } else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(BASE + path, { method, headers, body });
  const buf = Buffer.from(await res.arrayBuffer());
  const type = res.headers.get('content-type') ?? '';
  let json: any = null;
  if (type.includes('json')) {
    try { json = JSON.parse(buf.toString('utf8')); } catch { /* gövde JSON değil */ }
  }
  return { status: res.status, json, buf, type };
}

let n = 0;
async function step(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    n++;
    console.log('  ✓', name);
  } catch (err) {
    console.error('  ✗', name, '\n    ', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

const expectError = (r: Res, status: number, code: string) => {
  assert.equal(r.status, status, `beklenen HTTP ${status}, gelen ${r.status}: ${r.buf.toString('utf8').slice(0, 200)}`);
  assert.equal(r.json?.error?.code, code, `beklenen hata kodu ${code}, gelen ${JSON.stringify(r.json)}`);
};

/** Sunucu günlüğündeki en son doğrulama kodunu okur (yalnızca geliştirme modundaki ConsoleOtpSender). */
async function lastOtp(after: number): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const matches = [...readFileSync(LOG, 'utf8').matchAll(/doğrulama kodu: (\d{6})/g)];
    if (matches.length > after) return matches[matches.length - 1][1];
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('OTP kodu sunucu günlüğünde bulunamadı');
}
const otpCount = () => [...readFileSync(LOG, 'utf8').matchAll(/doğrulama kodu: (\d{6})/g)].length;

const consents = ['privacy_notice', 'explicit_consent', 'community_rules'].map((type) => ({ type, version: '1.0', granted: true }));

async function register(phone: string, name: string): Promise<string> {
  const before = otpCount();
  const rq = await call('POST', '/auth/otp/request', { body: { identifier: phone } });
  assert.equal(rq.status, 202, JSON.stringify(rq.json));
  const code = await lastOtp(before);
  const v = await call('POST', '/auth/otp/verify', { body: { identifier: phone, code } });
  assert.equal(v.status, 200, JSON.stringify(v.json));
  assert.ok(v.json.onboarding_token, 'yeni kullanıcı için onboarding_token bekleniyordu');
  const c = await call('POST', '/onboarding/complete', {
    body: { onboarding_token: v.json.onboarding_token, display_name: name, birth_date: '1996-04-12', consents },
  });
  assert.equal(c.status, 201, JSON.stringify(c.json));
  assert.ok(c.json.access_token, 'kayıt sonrası access_token bekleniyordu');
  return c.json.access_token;
}

async function main(): Promise<void> {
  if (!PASSWORD) throw new Error('SMOKE_PASSWORD tanımlı olmalı');
  const stamp = String(Date.now()).slice(-7);

  await step('kimlik doğrulamasız istek: 401 ve standart hata biçimi', async () => {
    expectError(await call('GET', '/cafes'), 401, 'UNAUTHORIZED');
    expectError(await call('GET', '/admin/reports'), 401, 'UNAUTHORIZED');
    expectError(await call('GET', '/cafe/me'), 401, 'UNAUTHORIZED');
    expectError(await call('POST', '/me/photos', { raw: makeJpeg(400, 400), type: 'image/jpeg' }), 401, 'UNAUTHORIZED');
  });

  await step('DTO doğrulaması: eksik/yanlış alan 422 VALIDATION_ERROR; bilinmeyen alan reddedilir', async () => {
    expectError(await call('POST', '/auth/otp/request', { body: {} }), 422, 'VALIDATION_ERROR');
    expectError(await call('POST', '/auth/otp/request', { body: { identifier: '0532 111 22 33', hack: 1 } }), 422, 'VALIDATION_ERROR');
    expectError(await call('POST', '/cafe/auth/login', { body: { email: 'gecersiz' } }), 422, 'VALIDATION_ERROR');
  });

  await step('oturum açma hataları aynı koda iner (kafe ve yönetici)', async () => {
    expectError(await call('POST', '/cafe/auth/login', { body: { email: 'yok@example.com', password: 'yanlis-parola-1' } }), 401, 'INVALID_CREDENTIALS');
    expectError(await call('POST', '/admin/auth/login', { body: { email: 'yok@example.com', password: 'yanlis-parola-1' } }), 401, 'INVALID_CREDENTIALS');
  });

  const a = await (async () => {
    let token = '';
    await step('kayıt: OTP isteği → kod (günlükten) → doğrulama → onboarding → token', async () => {
      token = await register(`053${stamp}1`, 'Deniz');
    });
    return token;
  })();

  await step('profil ve kafe listesi: kayıtlı kullanıcı kendi profilini ve demo kafeyi görür', async () => {
    const me = await call('GET', '/me', { token: a });
    assert.equal(me.status, 200); assert.equal(me.json.display_name, 'Deniz');
    const list = await call('GET', '/cafes', { token: a });
    assert.equal(list.status, 200);
    assert.ok(list.json.cafes.some((c: any) => c.name === 'Coffee Lab (Demo)'), 'seed kafe listede yok');
  });

  let cafeId = '';
  let qrToken = '';
  let cafeToken = '';
  await step('kafe paneli: giriş → dönen QR (gerçek check-in için)', async () => {
    const login = await call('POST', '/cafe/auth/login', { body: { email: CAFE_EMAIL, password: PASSWORD } });
    assert.equal(login.status, 200, JSON.stringify(login.json));
    cafeToken = login.json.access_token;
    const qr = await call('GET', '/cafe/qr', { token: cafeToken });
    assert.equal(qr.status, 200, JSON.stringify(qr.json));
    cafeId = qr.json.cafe_id; qrToken = qr.json.token;
    assert.ok(qr.json.expires_in > 0);
    assert.equal(JSON.stringify(qr.json).includes('secret'), false);
  });

  await step('check-in: QR okut → niyet → görünür ol → keşif listesi', async () => {
    const scan = await call('POST', '/checkins/scan', { token: a, body: { cafe_id: cafeId, qr_token: qrToken } });
    assert.ok(scan.status === 200 || scan.status === 201, JSON.stringify(scan.json));
    const bad = await call('POST', '/checkins/scan', { token: a, body: { cafe_id: cafeId, qr_token: 'x'.repeat(22) } });
    assert.equal(bad.status >= 400, true);
    assert.equal((await call('PUT', '/checkins/current/intents', { token: a, body: { intents: ['coffee', 'friends'] } })).status, 200);
    assert.equal((await call('PUT', '/checkins/current/visibility', { token: a, body: { visible: true } })).status, 200);
    const d = await call('GET', '/discover', { token: a });
    assert.equal(d.status, 200, JSON.stringify(d.json));
    assert.ok(Array.isArray(d.json.people));
  });

  let photoKey = '';
  await step('fotoğraf: ham gövde yükleme → pending → sahibi görür; yanlış tür reddedilir', async () => {
    const up = await call('POST', '/me/photos', { token: a, raw: makeJpeg(400, 400, { exif: 'GPS-GIZLI' }), type: 'image/jpeg' });
    assert.equal(up.status, 201, JSON.stringify(up.json));
    assert.equal(up.json.photo.moderation, 'pending');
    const list = await call('GET', '/me/photos', { token: a });
    photoKey = list.json.photos[0].storage_key;
    const file = await call('GET', `/media/${photoKey}`, { token: a });
    assert.equal(file.status, 200); assert.equal(file.type, 'image/jpeg');
    assert.equal(file.buf.includes(Buffer.from('GPS-GIZLI')), false, 'EXIF sızdı');
    const gif = await call('POST', '/me/photos', { token: a, raw: Buffer.from('GIF89a......'), type: 'image/gif' });
    assert.equal(gif.status >= 400 && gif.status < 500, true);
  });

  await step('ikinci kullanıcı: onaysız fotoğrafı göremez; yönetici onaylayınca görür', async () => {
    const b = await register(`054${stamp}2`, 'Ece');
    expectError(await call('GET', `/media/${photoKey}`, { token: b }), 404, 'PHOTO_NOT_FOUND');
    const adm = await call('POST', '/admin/auth/login', { body: { email: ADMIN_EMAIL, password: PASSWORD } });
    assert.equal(adm.status, 200, JSON.stringify(adm.json));
    const q = await call('GET', '/admin/photos', { token: adm.json.access_token });
    assert.equal(q.status, 200);
    const mine = q.json.photos.find((p: any) => p.display_name === 'Deniz');
    assert.ok(mine, 'fotoğraf moderasyon kuyruğunda yok');
    assert.equal((await call('POST', `/admin/photos/${mine.id}/review`, { token: adm.json.access_token, body: { decision: 'approve' } })).status, 200);
    assert.equal((await call('GET', `/media/${photoKey}`, { token: b })).status, 200);
    assert.equal((await call('GET', '/admin/reports', { token: adm.json.access_token })).status, 200);
    assert.equal((await call('GET', '/admin/cafes', { token: adm.json.access_token })).status, 200);
    // yönetici token'ı kullanıcı ucunda geçmez
    expectError(await call('GET', '/me', { token: adm.json.access_token }), 401, 'UNAUTHORIZED');
  });

  await step('etkinlik: kafe oluşturur → kullanıcı listeden görür ve katılır', async () => {
    const start = new Date(Date.now() + 2 * 86400_000);
    const end = new Date(start.getTime() + 2 * 3600_000);
    const ev = await call('POST', '/cafe/events', { token: cafeToken, body: { title: 'Duman Testi Gecesi', category: 'quiz', starts_at: start.toISOString(), ends_at: end.toISOString(), capacity: 10 } });
    assert.equal(ev.status, 201, JSON.stringify(ev.json));
    const list = await call('GET', `/cafes/${cafeId}/events`, { token: a });
    const found = list.json.events.find((e: any) => e.id === ev.json.event.id);
    assert.ok(found); assert.equal(found.joined, false);
    assert.equal((await call('POST', `/events/${ev.json.event.id}/join`, { token: a })).status, 200);
    assert.equal(((await call('GET', '/me/events', { token: a })).json.events as any[]).length >= 1, true);
  });

  await step('bilinmeyen yol: JSON hata biçimi, sunucu ayakta', async () => {
    const r = await call('GET', '/yok-boyle-bir-yol', { token: a });
    assert.equal(r.status, 404);
    assert.ok(r.json?.error?.code, 'hata gövdesi {error:{code}} biçiminde değil');
  });

  console.log(`\nDuman testi: ${n} adım geçti`);
}

main().catch((err) => {
  console.error('BAŞARISIZ', err);
  process.exit(1);
});
