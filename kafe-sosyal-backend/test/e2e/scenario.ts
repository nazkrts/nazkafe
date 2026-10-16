// @ts-nocheck
/**
 * Uçtan uca senaryo: gerçek servis kodu + GERÇEK PostgreSQL (pg sürücüsü) + bellek içi KV.
 * Tüm MVP akışını (kayıt, check-in, keşif, eşleşme, sohbet, davet, şikâyet, moderasyon, fotoğraf,
 * etkinlik, kafe paneli) adım adım doğrular.
 *
 * Çalıştırma: BOŞ ve migrate edilmiş bir veritabanı gerekir; adı `_e2e` veya `_test` ile bitmelidir
 * (yanlışlıkla gerçek veritabanına çalışmasın diye). Örnek:
 *   createdb kafe_e2e && DATABASE_URL=postgres://.../kafe_e2e npm run db:migrate
 *   DATABASE_URL=postgres://.../kafe_e2e JWT_SECRET=... npm run test:e2e
 * Senaryo veri ekler; tekrar çalıştırmadan önce veritabanını sıfırla.
 */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';

/* eslint-disable */
const S = require('node:path').join(__dirname, '..', '..', 'src');
{
  const url = process.env.DATABASE_URL ?? '';
  let name = '';
  try { name = new URL(url).pathname.slice(1); } catch { /* geçersiz URL */ }
  if (!/(_e2e|_test)$/.test(name) && process.env.E2E_CONFIRM !== 'yes') {
    console.error(`Güvenlik: veritabanı adı "_e2e" veya "_test" ile bitmeli (verilen: "${name}"). Bilerek devam etmek için E2E_CONFIRM=yes.`);
    process.exit(2);
  }
}
const { loadConfig } = require(`${S}/config/app-config`);
const { DbService } = require(`${S}/db/db.service`);
const { MemoryKvStore } = require(`${S}/kv/kv.store`);
const { JwtService } = require('@nestjs/jwt');
const { TokensService } = require(`${S}/auth/tokens.service`);
const { AuthService } = require(`${S}/auth/auth.service`);
const { JwtAuthGuard } = require(`${S}/auth/auth.guard`);
const { OnboardingService } = require(`${S}/onboarding/onboarding.service`);
const { MeService } = require(`${S}/me/me.service`);
const { CafesService } = require(`${S}/cafes/cafes.service`);
const { CheckinsService } = require(`${S}/checkins/checkins.service`);
const { CheckinsMaintenanceService } = require(`${S}/checkins/checkins-maintenance.service`);
const { DiscoverService } = require(`${S}/discover/discover.service`);
const { BlocksService } = require(`${S}/blocks/blocks.service`);
const { MatchesService } = require(`${S}/matches/matches.service`);
const { InvitationsService } = require(`${S}/invitations/invitations.service`);
const { SafetyService } = require(`${S}/safety/safety.service`);
const { ReportsService } = require(`${S}/reports/reports.service`);
const { AdminAuthService } = require(`${S}/admin/admin-auth.service`);
const { AdminAuthGuard } = require(`${S}/admin/admin-auth.guard`);
const { AdminReportsService } = require(`${S}/admin/admin-reports.service`);
const { AdminActionsService } = require(`${S}/admin/admin-actions.service`);
const { AdminPhotosService } = require(`${S}/admin/admin-photos.service`);
const { CafeAuthService } = require(`${S}/cafe-panel/cafe-auth.service`);
const { CafeAuthGuard } = require(`${S}/cafe-panel/cafe-auth.guard`);
const { CafePanelService } = require(`${S}/cafe-panel/cafe-panel.service`);
const { CafeEventsService } = require(`${S}/cafe-panel/cafe-events.service`);
const { CafeStatsService } = require(`${S}/cafe-panel/cafe-stats.service`);
const { CafeRegisterService } = require(`${S}/cafe-panel/cafe-register.service`);
const { AdminCafesService } = require(`${S}/admin/admin-cafes.service`);
const { EventsService } = require(`${S}/events/events.service`);
const { PhotosService } = require(`${S}/photos/photos.service`);
const { MemoryPhotoStorage } = require(`${S}/photos/photo-storage`);
const { makeJpeg, makePng } = require('../helpers/images');
const { hashPassword, verifyPassword } = require(`${S}/common/crypto`);
const { identifierHash, parseIdentifier } = require(`${S}/common/identifier`);
const { qrTokenFor, qrWindowOf } = require(`${S}/common/qr`);
const { decryptField } = require(`${S}/common/crypto`);
const { computeAge } = require(`${S}/common/age`);
const { AppError } = require(`${S}/common/errors`);

let pass = 0;
let fail = 0;
const failures: string[] = [];
async function t(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    pass++;
    console.log('  ✓', name);
  } catch (e: any) {
    fail++;
    failures.push(name);
    console.log('  ✗', name, '\n      ' + String(e?.message ?? e).split('\n').slice(0, 8).join('\n      '));
  }
}
const code = async (p: Promise<unknown>): Promise<string | null> => {
  try {
    await p;
    return null;
  } catch (e: any) {
    return e instanceof AppError ? e.code : 'OTHER:' + (e?.message ?? e);
  }
};
const sec = (s: string) => console.log('\n## ' + s);

const cfg = loadConfig({
  NODE_ENV: 'test',
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET ?? 'j'.repeat(40),
  PHONE_PEPPER: 'p'.repeat(20),
  DATA_ENC_KEY: Buffer.alloc(32, 1).toString('base64'),
  REQUIRE_APPROVED_PHOTO: 'false',
});
const db = new DbService(cfg);
const kv = new MemoryKvStore();
const jwt = new JwtService({ secret: cfg.jwtSecret });
const tokens = new TokensService(jwt, db, kv, cfg);
const sent: { to: any; code: string }[] = [];
const sender = { send: async (to: any, c: string) => void sent.push({ to, code: c }) };
const auth = new AuthService(db, tokens, kv, cfg, sender);
const onboarding = new OnboardingService(db, tokens, kv, cfg);
const store = new MemoryPhotoStorage();
const me = new MeService(db, tokens, store);
const cafes = new CafesService(db, cfg);
const checkins = new CheckinsService(db, kv, cfg);
const discover = new DiscoverService(db, checkins, kv, cfg);
const blocks = new BlocksService(db);
const matches = new MatchesService(db, kv);
const invitations = new InvitationsService(db, checkins, kv);
const safety = new SafetyService(db, checkins, kv);
const reports = new ReportsService(db, kv);
const adminAuth = new AdminAuthService(db, jwt, kv);
const adminGuard = new AdminAuthGuard(jwt, db);
const adminReports = new AdminReportsService(db);
const adminActions = new AdminActionsService(db, tokens);
const photos = new PhotosService(db, store, kv);
const adminPhotos = new AdminPhotosService(db, store);
const cafeAuth = new CafeAuthService(db, jwt, kv);
const cafeGuard = new CafeAuthGuard(jwt, db);
const cafePanel = new CafePanelService(db, cfg);
const cafeEvents = new CafeEventsService(db);
const cafeStats = new CafeStatsService(db, cfg);
const cafeRegister = new CafeRegisterService(db, kv);
const adminCafes = new AdminCafesService(db);
const eventsSvc = new EventsService(db, kv);
const guard = new JwtAuthGuard(jwt, db);

const consentsOk = ['privacy_notice', 'explicit_consent', 'community_rules'].map((type) => ({ type, version: '1.0', granted: true }));
const q = async (sql: string, p?: unknown[]) => (await db.query(sql, p)).rows;
const count = async (sql: string, p?: unknown[]) => (await q(sql, p))[0].n as number;

async function otpFor(raw: string, ip = '1.1.1.1') {
  const before = sent.length;
  await auth.requestOtp(raw, ip);
  assert.equal(sent.length, before + 1, 'kod gönderilmeli');
  return sent[sent.length - 1].code;
}
async function register(raw: string, name: string, birth = '1998-05-17') {
  const v: any = await auth.verifyOtp(raw, await otpFor(raw));
  assert.equal(v.onboarding_required, true);
  const r = await onboarding.complete({ onboarding_token: v.onboarding_token, display_name: name, birth_date: birth, consents: consentsOk });
  return { id: r.user.id as string, ...r };
}
async function mkCafe(name: string, status = 'active', hours: object = {}) {
  const secret = randomBytes(32);
  const r = await q(
    `INSERT INTO cafes (name, address, city, district, status, qr_secret, opening_hours)
     VALUES ($1,'Adres','İstanbul','Kadıköy',$2,$3,$4::jsonb) RETURNING id`,
    [name, status, secret, JSON.stringify(hours)],
  );
  return { id: r[0].id as string, secret, name };
}
const tokenOf = (c: { id: string; secret: Buffer }, back = 0) => qrTokenFor(c.secret, c.id, qrWindowOf(Date.now(), cfg.qrWindowSeconds) - back);
async function quickUser(name: string) {
  return (await q(`INSERT INTO users (email, display_name, birth_date) VALUES ($1,$2,'1995-01-01') RETURNING id`, [`${randomUUID()}@t.io`, name]))[0].id as string;
}
async function quickCheckin(uid: string, cafeId: string, visible = true) {
  return (await q(`INSERT INTO checkins (user_id, cafe_id, visible, expires_at) VALUES ($1,$2,$3, now() + interval '3 hours') RETURNING id`, [uid, cafeId, visible]))[0].id as string;
}
const ids = async (uid: string, svc: any = discover) => (await svc.list(uid)).people.map((p: any) => p.user_id as string);
const reqWith = (authorization?: string) => {
  const req: any = { headers: authorization ? { authorization } : {} };
  return { req, ctx: { switchToHttp: () => ({ getRequest: () => req }) } };
};
const clearCooldown = (raw: string) => kv.del('otp:cd:' + identifierHash(parseIdentifier(raw)!, cfg.phonePepper));

async function main() {
  const U: Record<string, any> = {};

  sec('1. OTP ve kayıt');
  await t('18 yaş altı reddedilir; aynı numarayla farklı doğum tarihi de engellenir; kayıt oluşmaz', async () => {
    const raw = '0555 000 00 00';
    const c = await otpFor(raw);
    assert.equal(await code(auth.verifyOtp(raw, c === '000000' ? '111111' : '000000')), 'OTP_INVALID');
    const v: any = await auth.verifyOtp(raw, c);
    const base = { onboarding_token: v.onboarding_token, display_name: 'Kid', consents: consentsOk };
    assert.equal(await code(onboarding.complete({ ...base, birth_date: '2012-03-01' })), 'AGE_RESTRICTED');
    assert.equal(await code(onboarding.complete({ ...base, birth_date: '1990-01-01' })), 'AGE_RESTRICTED');
    assert.equal(await count(`SELECT count(*)::int AS n FROM users`), 0);
  });
  await t('telefonla (A, B, D, E) ve e-postayla (C) hesap açılır', async () => {
    U.A = await register('0532 111 22 33', 'Ayşe');
    U.B = await register('0533 222 33 44', 'Mehmet');
    U.C = await register('c@ornek.com', 'Elif');
    U.D = await register('0534 333 44 55', 'Can');
    U.E = await register('0535 444 55 66', 'Deniz');
    for (const k of 'ABCDE') assert.ok(U[k].access_token && U[k].refresh_token && U[k].id);
  });
  await t('telefon açık yazılmaz: yalnızca özet ve şifreli alan; çözülünce doğru numara çıkar', async () => {
    const row = (await q(`SELECT phone_hash, email, encode(phone_enc,'hex') AS h FROM users WHERE id=$1`, [U.A.id]))[0];
    assert.ok(row.phone_hash && row.email === null);
    assert.equal(row.phone_hash, identifierHash(parseIdentifier('0532 111 22 33'), cfg.phonePepper));
    const bytes = Buffer.from(row.h, 'hex');
    assert.ok(!bytes.toString('utf8').includes('905321112233'));
    assert.equal(decryptField(cfg.dataEncKey, bytes), '+905321112233');
    const c = (await q(`SELECT phone_hash, email FROM users WHERE id=$1`, [U.C.id]))[0];
    assert.equal(c.phone_hash, null);
    assert.equal(c.email, 'c@ornek.com');
    assert.equal(await count(`SELECT count(*)::int AS n FROM consents WHERE user_id=$1`, [U.A.id]), 3);
  });
  await t('kayıt doğrulamaları: ad, rıza, sürüm, tarih, tekrar, bozuk token', async () => {
    const raw = '0536 555 66 77';
    const v: any = await auth.verifyOtp(raw, await otpFor(raw));
    const base = { onboarding_token: v.onboarding_token, birth_date: '1990-01-01', consents: consentsOk, display_name: 'Fatma' };
    assert.equal(await code(onboarding.complete({ ...base, display_name: 'ig: fatma' })), 'INVALID_DISPLAY_NAME');
    assert.equal(await code(onboarding.complete({ ...base, consents: consentsOk.slice(0, 2) })), 'CONSENT_REQUIRED');
    assert.equal(await code(onboarding.complete({ ...base, consents: consentsOk.map((c) => ({ ...c, version: '0.9' })) })), 'CONSENT_REQUIRED');
    assert.equal(await code(onboarding.complete({ ...base, birth_date: '2000-02-30' })), 'INVALID_BIRTH_DATE');
    assert.equal(await code(onboarding.complete({ ...base, birth_date: '1900-01-01' })), 'INVALID_BIRTH_DATE');
    assert.ok((await onboarding.complete(base)).access_token);
    assert.equal(await code(onboarding.complete(base)), 'ACCOUNT_EXISTS');
    assert.equal(await code(onboarding.complete({ ...base, onboarding_token: 'x.y.z' })), 'ONBOARDING_TOKEN_INVALID');
  });
  await t('giriş: mevcut kullanıcı onboarding istemez; 60 sn bekleme süresi tekrar kod göndermez', async () => {
    const raw = '0532 111 22 33';
    const before = sent.length;
    await auth.requestOtp(raw, '1.1.1.1');
    assert.equal(sent.length, before, 'bekleme süresinde yeni kod gitmemeli');
    await clearCooldown(raw);
    const v: any = await auth.verifyOtp(raw, await otpFor(raw));
    assert.equal(v.onboarding_required, false);
    assert.ok(v.access_token && v.refresh_token);
    U.A.login = v;
  });
  await t('OTP: 5 hatalı denemeden sonra doğru kod bile kabul edilmez', async () => {
    const raw = '0537 666 77 88';
    const c = await otpFor(raw);
    const bad = c === '123456' ? '654321' : '123456';
    for (let i = 0; i < 5; i++) assert.equal(await code(auth.verifyOtp(raw, bad)), 'OTP_INVALID');
    assert.equal(await code(auth.verifyOtp(raw, c)), 'TOO_MANY_ATTEMPTS');
    assert.equal(await code(auth.verifyOtp(raw, c)), 'TOO_MANY_ATTEMPTS');
  });
  await t('OTP istek sınırı: aynı adrese saatte en fazla 5 istek', async () => {
    const raw = 'limit@ornek.com';
    const res: (string | null)[] = [];
    for (let i = 0; i < 6; i++) res.push(await code(auth.requestOtp(raw, '2.2.2.2')));
    assert.deepEqual(res, [null, null, null, null, null, 'TOO_MANY_REQUESTS']);
  });
  await t('geçersiz telefon/e-posta reddedilir', async () => {
    assert.equal(await code(auth.requestOtp('abc', '3.3.3.3')), 'INVALID_IDENTIFIER');
  });

  sec('2. Oturum: guard ve refresh');
  await t('guard: geçerli token geçer; eksik, bozuk ve refresh token reddedilir', async () => {
    const ok = reqWith('Bearer ' + U.A.access_token);
    assert.equal(await guard.canActivate(ok.ctx), true);
    assert.equal(ok.req.user.id, U.A.id);
    for (const h of [undefined, 'Bearer ' + U.A.refresh_token, 'Bearer ' + U.A.access_token.slice(0, -3) + 'abc', 'Basic xyz']) {
      assert.equal(await code(guard.canActivate(reqWith(h).ctx)), 'UNAUTHORIZED', String(h));
    }
  });
  await t('refresh token tek kullanımlık; logout sonrası geçersiz', async () => {
    const r1 = await auth.refresh(U.A.login.refresh_token);
    assert.notEqual(r1.refresh_token, U.A.login.refresh_token);
    assert.equal(await code(auth.refresh(U.A.login.refresh_token)), 'TOKEN_INVALID');
    await auth.logout(r1.refresh_token);
    assert.equal(await code(auth.refresh(r1.refresh_token)), 'TOKEN_INVALID');
  });
  await t('askıya alınan kullanıcı token süresi dolmadan da dışarıda kalır', async () => {
    const z = await register('0538 777 88 99', 'Zeynep');
    await q(`UPDATE users SET status='suspended' WHERE id=$1`, [z.id]);
    assert.equal(await code(guard.canActivate(reqWith('Bearer ' + z.access_token).ctx)), 'ACCOUNT_DISABLED');
    assert.equal(await code(auth.refresh(z.refresh_token)), 'ACCOUNT_DISABLED');
    const raw = '0538 777 88 99';
    await clearCooldown(raw);
    assert.equal(await code(auth.verifyOtp(raw, await otpFor(raw))), 'ACCOUNT_DISABLED');
  });

  sec('3. Profil, ilgi alanları, rızalar');
  const ints: any[] = (await me.listInterests()).interests;
  const iid = (slug: string) => ints.find((i) => i.slug === slug).id as number;
  await t('bio: iletişim bilgisi reddedilir; geçerli bio kaydedilir; kısmi güncelleme bio\'yu bozmaz', async () => {
    assert.equal(await code(me.updateMe(U.A.id, { bio: 'Beni ara 0532 111 22 33' })), 'CONTACT_INFO_NOT_ALLOWED');
    assert.equal((await me.updateMe(U.A.id, { bio: 'Kahve ve sinema ☕' })).bio, 'Kahve ve sinema ☕');
    const r = await me.updateMe(U.A.id, { display_name: 'Ayşe Nur' });
    assert.equal(r.display_name, 'Ayşe Nur');
    assert.equal(r.bio, 'Kahve ve sinema ☕');
    assert.equal((await me.updateMe(U.A.id, { display_name: 'Ayşe' })).display_name, 'Ayşe');
    assert.equal((await me.updateMe(U.A.id, { bio: null })).bio, null);
    await me.updateMe(U.A.id, { bio: 'Yeni insanlarla tanışmayı seviyorum.' });
  });
  await t('ilgi alanları atanır; bilinmeyen id reddedilir ve eski liste bozulmaz', async () => {
    await me.setInterests(U.A.id, ['coffee', 'cinema', 'music', 'running'].map(iid));
    await me.setInterests(U.B.id, ['coffee', 'cinema', 'games'].map(iid));
    await me.setInterests(U.C.id, ['books'].map(iid));
    await me.setInterests(U.D.id, ['coffee', 'music'].map(iid));
    assert.equal(await code(me.setInterests(U.A.id, [iid('coffee'), 9999])), 'UNKNOWN_INTEREST');
    assert.equal((await me.getMe(U.A.id)).interests.length, 4);
  });
  await t('rızalar: zorunlu rıza geri çekilemez, pazarlama izni verilebilir, eski sürüm reddedilir', async () => {
    assert.equal((await me.listConsents(U.A.id)).consents.length, 3);
    assert.equal(await code(me.changeConsent(U.A.id, { type: 'privacy_notice', version: '1.0', granted: false })), 'CONSENT_REQUIRED');
    assert.equal(await code(me.changeConsent(U.A.id, { type: 'marketing', version: '0.1', granted: true })), 'CONSENT_VERSION_MISMATCH');
    const r = await me.changeConsent(U.A.id, { type: 'marketing', version: '1.0', granted: true });
    assert.equal(r.consents.find((c: any) => c.type === 'marketing').granted, true);
  });

  sec('4. Kafeler');
  const cafe1 = await mkCafe('Coffee Lab Test');
  const cafe2 = await mkCafe('Kapalı Kafe', 'active', { mon: [] });
  const cafePending = await mkCafe('Onay Bekleyen', 'pending');
  await q(`INSERT INTO cafe_meeting_points (cafe_id, label) VALUES ($1,'Kasanın yanı'), ($1,'Giriş')`, [cafe1.id]);
  await q(`INSERT INTO events (cafe_id,title,category,starts_at,ends_at) VALUES ($1,'Kahve Tadımı','tasting', now()+interval '1 day', now()+interval '1 day 2 hours')`, [cafe1.id]);
  await t('liste yalnızca aktif kafeleri verir; açık/kapalı doğru; başlangıçta sayılar boş', async () => {
    const l = (await cafes.list({})).cafes;
    const names = l.map((c: any) => c.name).sort();
    assert.ok(names.includes('Coffee Lab Test') && names.includes('Kapalı Kafe') && !names.includes('Onay Bekleyen'));
    const c1 = l.find((c: any) => c.id === cafe1.id);
    assert.equal(c1.is_open_now, true);
    assert.equal(l.find((c: any) => c.id === cafe2.id).is_open_now, false);
    assert.deepEqual(c1.social_open, { bucket: 'none', label: '0' });
    assert.ok(!('opening_hours' in c1) && !('open_count' in c1) && !('qr_secret' in c1));
  });
  await t('arama: LIKE joker karakterleri kaçırılır; ad ile bulunur; detay ve etkinlikler', async () => {
    assert.equal((await cafes.list({ q: '%' })).cafes.length, 0);
    assert.equal((await cafes.list({ q: '_' })).cafes.length, 0);
    assert.equal((await cafes.list({ q: 'coffee lab' })).cafes.length, 1);
    const d = await cafes.detail(cafe1.id);
    assert.equal(d.meeting_points_count, 2);
    assert.equal(d.upcoming_events.length, 1);
    assert.ok(!('qr_secret' in d));
    assert.equal(await code(cafes.detail(cafePending.id)), 'CAFE_NOT_FOUND');
    assert.equal(await code(cafes.detail(randomUUID())), 'CAFE_NOT_FOUND');
    assert.equal((await cafes.events(cafe1.id)).events.length, 1);
  });

  sec('5. Check-in');
  await t('QR: hatalı, süresi geçmiş, onaysız kafe ve kapalı kafe reddedilir; denemeler kaydedilir', async () => {
    assert.equal(await code(checkins.scan(U.A.id, cafe1.id, 'x'.repeat(22))), 'QR_INVALID');
    assert.equal(await code(checkins.scan(U.A.id, cafe1.id, tokenOf(cafe1, 4))), 'QR_EXPIRED');
    assert.equal(await code(checkins.scan(U.A.id, cafe1.id, tokenOf(cafe2))), 'QR_INVALID'); // başka kafenin token'ı
    assert.equal(await code(checkins.scan(U.A.id, cafePending.id, tokenOf(cafePending))), 'QR_INVALID');
    assert.equal(await code(checkins.scan(U.A.id, cafe2.id, tokenOf(cafe2))), 'CAFE_CLOSED');
    const reasons = (await q(`SELECT DISTINCT reason FROM checkin_attempts WHERE user_id=$1 AND NOT success`, [U.A.id])).map((r) => r.reason);
    for (const r of ['qr_invalid', 'qr_expired', 'cafe_unavailable', 'cafe_closed']) assert.ok(reasons.includes(r), r);
  });
  await t('geçerli QR: görünürlük kapalı başlar, süre tam 3 saat, ikinci check-in reddedilir', async () => {
    const r = await checkins.scan(U.A.id, cafe1.id, tokenOf(cafe1));
    assert.equal(r.checkin.visible, false);
    assert.equal(r.checkin.cafe.id, cafe1.id);
    assert.equal(new Date(r.checkin.expires_at).getTime() - new Date(r.checkin.started_at).getTime(), 3 * 3600 * 1000);
    assert.equal(await code(checkins.scan(U.A.id, cafe1.id, tokenOf(cafe1))), 'ALREADY_CHECKED_IN');
    const cur = await checkins.current(U.A.id);
    assert.equal(cur.checkin.id, r.checkin.id);
    assert.deepEqual(cur.checkin.intents, []);
  });
  await t('önceki pencerenin token\'ı (taramaya pay) kabul edilir', async () => {
    const x = await quickUser('Pay');
    assert.ok((await checkins.scan(x, cafe1.id, tokenOf(cafe1, 1))).checkin.id);
    await checkins.end(x);
  });
  await t('niyet seçimi çoklu; bilinmeyen niyet reddedilir; görünürlük için onaylı fotoğraf şartı', async () => {
    const r = await checkins.setIntents(U.A.id, ['coffee', 'dating']);
    assert.deepEqual(r.checkin.intents, ['coffee', 'dating']);
    assert.deepEqual((await checkins.setIntents(U.A.id, ['friends'])).checkin.intents, ['friends']); // değiştirir, eklemez
    assert.equal(await code(checkins.setIntents(U.A.id, ['coffee', 'yok'])), 'UNKNOWN_INTENT');
    assert.deepEqual((await checkins.current(U.A.id)).checkin.intents, ['friends']); // hata eski seçimi bozmadı
    const strict = new CheckinsService(db, kv, { ...cfg, requireApprovedPhoto: true });
    assert.equal(await code(strict.setVisibility(U.A.id, true)), 'PHOTO_REQUIRED');
    await q(`INSERT INTO user_photos (user_id, storage_key, moderation) VALUES ($1,'a.jpg','approved')`, [U.A.id]);
    assert.equal((await strict.setVisibility(U.A.id, true)).checkin.visible, true);
    assert.equal((await checkins.setVisibility(U.A.id, false)).checkin.visible, false); // kapatmak her zaman serbest
    assert.equal((await checkins.setVisibility(U.A.id, true)).checkin.visible, true);
  });
  await t('B, C, D check-in yapıp görünür olur; E görünmez kalır', async () => {
    for (const k of 'BCDE') {
      await checkins.scan(U[k].id, cafe1.id, tokenOf(cafe1));
      await checkins.setIntents(U[k].id, ['meet']);
      if (k !== 'E') await checkins.setVisibility(U[k].id, true);
    }
  });
  await t('kafe kartı sayıları kovalanır: 5 check-in, 4 görünür → "5" ve "4"', async () => {
    const c1 = (await cafes.list({})).cafes.find((c: any) => c.id === cafe1.id);
    assert.deepEqual(c1.checkins, { bucket: 'exact', label: '5' });
    assert.deepEqual(c1.social_open, { bucket: 'exact', label: '4' });
  });
  await t('kovalama: 1-2 kişi "Birkaç", 10+ → "10+"', async () => {
    const solo = await mkCafe('Tek Kişilik');
    const u1 = await quickUser('S1');
    await quickCheckin(u1, solo.id, true);
    let c = (await cafes.list({ q: 'Tek Kişilik' })).cafes[0];
    assert.deepEqual(c.social_open, { bucket: 'few', label: 'Birkaç' });
    for (let i = 0; i < 11; i++) await quickCheckin(await quickUser('S' + i), solo.id, i % 2 === 0);
    c = (await cafes.list({ q: 'Tek Kişilik' })).cafes[0];
    assert.deepEqual(c.checkins, { bucket: 'many', label: '10+' });
  });
  await t('şüpheli check-in: kısa sürede 3. farklı kafe engellenir', async () => {
    const [c4, c5, c6] = [await mkCafe('K4'), await mkCafe('K5'), await mkCafe('K6')];
    const x = await quickUser('X');
    await checkins.scan(x, c4.id, tokenOf(c4));
    await checkins.end(x);
    await checkins.scan(x, c5.id, tokenOf(c5));
    await checkins.end(x);
    assert.equal(await code(checkins.scan(x, c6.id, tokenOf(c6))), 'TOO_MANY_ATTEMPTS');
    assert.ok((await q(`SELECT 1 FROM checkin_attempts WHERE user_id=$1 AND reason='multi_cafe'`, [x])).length >= 1);
  });
  await t('QR deneme hız sınırı: 10 denemeden sonra engellenir', async () => {
    const z = await quickUser('Z');
    for (let i = 0; i < 10; i++) assert.equal(await code(checkins.scan(z, cafe1.id, 'y'.repeat(22))), 'QR_INVALID');
    assert.equal(await code(checkins.scan(z, cafe1.id, tokenOf(cafe1))), 'TOO_MANY_ATTEMPTS');
  });

  sec('6. Keşif, beğeni, eşleşme');
  const KEYS = ['age', 'common_interests', 'display_name', 'photo_key', 'photo_verified', 'user_id'];
  await t('görünür olmayan veya check-in\'siz kullanıcı listeyi göremez', async () => {
    assert.equal(await code(discover.list(U.E.id)), 'VISIBILITY_OFF');
    assert.equal(await code(discover.list(await quickUser('Yok'))), 'NO_ACTIVE_CHECKIN');
  });
  await t('A\'nın listesi: yalnızca B, C, D; kendisi ve gizli E yok; ortak ilgi çok olan önde', async () => {
    const l = await discover.list(U.A.id);
    const got = l.people.map((p: any) => p.user_id);
    assert.deepEqual([...got].sort(), [U.B.id, U.C.id, U.D.id].sort());
    assert.equal(got[2], U.C.id);
    const b = l.people.find((p: any) => p.user_id === U.B.id);
    assert.deepEqual(b.common_interests.map((i: any) => i.label), ['Kahve', 'Sinema']);
    assert.equal(b.display_name, 'Mehmet');
    assert.equal(b.age, computeAge({ y: 1998, m: 5, d: 17 }, new Date(), 'UTC') );
  });
  await t('gizlilik: kart yalnızca izin verilen alanları içerir (niyet, masa, konum, kafe kimliği, telefon yok)', async () => {
    const l = await discover.list(U.A.id);
    for (const p of l.people) assert.deepEqual(Object.keys(p).sort(), KEYS);
    const json = JSON.stringify(l.people);
    for (const bad of ['dating', 'friends', 'meet', 'intent', 'table', 'phone', 'email', '905', '@ornek', 'cafe_id', 'visible']) {
      assert.ok(!json.includes(bad), 'sızıntı: ' + bad);
    }
  });
  let matchAB = '';
  await t('A→B beğenisi eşleşme olmadan hiçbir şey ifşa etmez; B\'nin listesinde değişiklik yok', async () => {
    const before = JSON.stringify((await discover.list(U.B.id)).people.find((p: any) => p.user_id === U.A.id));
    assert.deepEqual(await discover.like(U.A.id, U.B.id), { ok: true });
    const after = JSON.stringify((await discover.list(U.B.id)).people.find((p: any) => p.user_id === U.A.id));
    assert.equal(after, before);
    assert.notEqual(after, undefined);
  });
  await t('B→A karşılıklı beğeni eşleşme üretir; tekrar beğeni aynı eşleşmeyi döner; liste dışı kalırlar', async () => {
    const r: any = await discover.like(U.B.id, U.A.id);
    assert.equal(r.matched, true);
    matchAB = r.match_id;
    const row = (await q(`SELECT user_a_id, user_b_id, status, cafe_id FROM matches WHERE id=$1`, [matchAB]))[0];
    assert.ok(row.user_a_id < row.user_b_id);
    assert.equal(row.status, 'active');
    assert.equal(row.cafe_id, cafe1.id);
    assert.deepEqual(await discover.like(U.A.id, U.B.id), { matched: true, match_id: matchAB });
    assert.ok(!(await ids(U.A.id)).includes(U.B.id));
    assert.ok(!(await ids(U.B.id)).includes(U.A.id));
    assert.equal(await count(`SELECT count(*)::int AS n FROM matches`), 1);
  });
  await t('"Geç": o check-in boyunca listeden düşer, karşı tarafın listesi etkilenmez', async () => {
    assert.deepEqual(await discover.pass(U.A.id, U.C.id), { ok: true });
    assert.ok(!(await ids(U.A.id)).includes(U.C.id));
    assert.ok((await ids(U.C.id)).includes(U.A.id));
    assert.equal(await code(discover.pass(U.A.id, randomUUID())), 'TARGET_UNAVAILABLE');
  });
  await t('geçersiz hedefler hep aynı hatayı verir: kendisi, gizli kişi, başka kafedeki kişi, olmayan kişi', async () => {
    const other = await mkCafe('Başka Kafe');
    const o = await quickUser('Uzak');
    await quickCheckin(o, other.id, true);
    for (const target of [U.A.id, U.E.id, o, randomUUID()]) {
      assert.equal(await code(discover.like(U.A.id, target)), 'TARGET_UNAVAILABLE');
    }
  });
  await t('beğeni limiti: check-in başına sınır aşılınca hata verir ve fazla beğeni kaydedilmez', async () => {
    const small = new DiscoverService(db, checkins, kv, { ...cfg, likeLimitPerCheckin: 2 });
    const l = await quickUser('L');
    await quickCheckin(l, cafe1.id, true);
    const ms: string[] = [];
    for (let i = 0; i < 4; i++) {
      const m = await quickUser('M' + i);
      await quickCheckin(m, cafe1.id, true);
      ms.push(m);
    }
    assert.deepEqual(await small.like(l, ms[0]), { ok: true });
    assert.deepEqual(await small.like(l, ms[1]), { ok: true });
    assert.equal(await code(small.like(l, ms[2])), 'LIKE_LIMIT');
    assert.equal(await count(`SELECT count(*)::int AS n FROM likes WHERE from_user_id=$1 AND kind='like'`, [l]), 2);
    assert.deepEqual(await small.pass(l, ms[2]), { ok: true }); // geçmek hakkı tüketmez
  });
  await t('onaylı fotoğraf şartı açıkken yalnızca fotoğrafı onaylı kişiler listelenir', async () => {
    await q(`INSERT INTO user_photos (user_id, storage_key, moderation) VALUES ($1,'d.jpg','approved')`, [U.D.id]);
    await q(`INSERT INTO user_photos (user_id, storage_key, moderation) VALUES ($1,'c.jpg','pending')`, [U.C.id]);
    const viewer = await quickUser('Bakan');
    await quickCheckin(viewer, cafe1.id, true);
    const strict = new DiscoverService(db, checkins, kv, { ...cfg, requireApprovedPhoto: true });
    const strictList = await ids(viewer, strict);
    assert.ok(strictList.includes(U.D.id) && strictList.includes(U.A.id));
    assert.ok(!strictList.includes(U.C.id) && !strictList.includes(U.E.id));
    assert.ok((await ids(viewer)).includes(U.C.id));
    const d = (await strict.list(viewer)).people.find((p: any) => p.user_id === U.D.id);
    assert.equal(d.photo_key, 'd.jpg');
  });
  await t('eşzamanlı karşılıklı beğeni: 6 çiftte her seferinde tam bir tarafa eşleşme döner, tek eşleşme satırı', async () => {
    const pairs: [string, string][] = [];
    for (let i = 0; i < 6; i++) {
      const p = await quickUser('P' + i);
      const qq = await quickUser('Q' + i);
      await quickCheckin(p, cafe1.id);
      await quickCheckin(qq, cafe1.id);
      pairs.push([p, qq]);
    }
    const results: any[] = await Promise.all(pairs.map(([p, qq]) => Promise.all([discover.like(p, qq), discover.like(qq, p)])));
    results.forEach(([r1, r2]: any[], i: number) => {
      assert.equal(!!r1.matched !== !!r2.matched, true, `çift ${i}: ${JSON.stringify([r1, r2])}`);
    });
    for (const [p, qq] of pairs) {
      assert.equal(
        await count(`SELECT count(*)::int AS n FROM matches WHERE user_a_id=LEAST($1::uuid,$2::uuid) AND user_b_id=GREATEST($1::uuid,$2::uuid)`, [p, qq]),
        1,
      );
    }
    U.pair = pairs[0];
  });
  await t('karşı taraf check-out yaptıysa beğeni eşleşmeye dönüşmez', async () => {
    const p = await quickUser('Cp');
    const qq = await quickUser('Cq');
    await quickCheckin(p, cafe1.id);
    await quickCheckin(qq, cafe1.id);
    assert.deepEqual(await discover.like(p, qq), { ok: true });
    await checkins.end(p);
    assert.equal(await code(discover.like(qq, p)), 'TARGET_UNAVAILABLE');
    assert.equal(await count(`SELECT count(*)::int AS n FROM matches WHERE user_a_id=LEAST($1::uuid,$2::uuid) AND user_b_id=GREATEST($1::uuid,$2::uuid)`, [p, qq]), 0);
  });
  await t('süresi dolan check-in: aktif sayılmaz, listeden düşer, bakım işi kapatır, yeniden QR okutulabilir', async () => {
    const cafe = await mkCafe('Süre Kafesi');
    const x1 = await quickUser('Eski');
    const watcher = await quickUser('Gözcü');
    await quickCheckin(watcher, cafe.id);
    await checkins.scan(x1, cafe.id, tokenOf(cafe));
    await checkins.setVisibility(x1, true);
    assert.ok((await ids(watcher)).includes(x1));
    await q(`UPDATE checkins SET started_at = now() - interval '3 hours 30 minutes', expires_at = now() - interval '30 minutes' WHERE user_id=$1`, [x1]);
    assert.equal((await checkins.current(x1)).checkin, null);
    assert.equal(await code(discover.list(x1)), 'NO_ACTIVE_CHECKIN');
    assert.ok(!(await ids(watcher)).includes(x1));
    assert.equal(await count(`SELECT count(*)::int AS n FROM checkins WHERE user_id=$1 AND ended_at IS NULL`, [x1]), 1);
    await new CheckinsMaintenanceService(db).tick();
    assert.equal(await count(`SELECT count(*)::int AS n FROM checkins WHERE user_id=$1 AND ended_at IS NULL`, [x1]), 0);
    assert.ok((await checkins.scan(x1, cafe.id, tokenOf(cafe))).checkin.id);
  });

  sec('7. Engelleme');
  await t('engelleme karşılıklıdır: iki taraf birbirini görmez, beğenemez; kaldırınca geri döner', async () => {
    assert.ok((await ids(U.A.id)).includes(U.D.id) && (await ids(U.D.id)).includes(U.A.id));
    assert.deepEqual(await blocks.block(U.A.id, U.D.id), { ok: true });
    assert.ok(!(await ids(U.A.id)).includes(U.D.id));
    assert.ok(!(await ids(U.D.id)).includes(U.A.id));
    assert.equal(await code(discover.like(U.D.id, U.A.id)), 'TARGET_UNAVAILABLE');
    assert.equal(await code(discover.like(U.A.id, U.D.id)), 'TARGET_UNAVAILABLE');
    assert.deepEqual((await blocks.listMine(U.A.id)).blocks.map((b: any) => b.user_id), [U.D.id]);
    await blocks.unblock(U.A.id, U.D.id);
    assert.ok((await ids(U.A.id)).includes(U.D.id) && (await ids(U.D.id)).includes(U.A.id));
    assert.deepEqual((await blocks.listMine(U.A.id)).blocks, []);
  });
  await t('engelleme eşleşmeyi kapatır; kendini/olmayan kişiyi engelleme hata verir; tekrar engelleme zararsız', async () => {
    const [p, qq] = U.pair;
    await blocks.block(p, qq);
    await blocks.block(p, qq);
    assert.equal((await q(`SELECT status FROM matches WHERE user_a_id=LEAST($1::uuid,$2::uuid) AND user_b_id=GREATEST($1::uuid,$2::uuid)`, [p, qq]))[0].status, 'blocked');
    assert.equal(await code(blocks.block(U.A.id, U.A.id)), 'CANNOT_BLOCK_SELF');
    assert.equal(await code(blocks.block(U.A.id, randomUUID())), 'TARGET_UNAVAILABLE');
  });


  sec('7b. Eşleşmeler ve mesajlaşma');
  const M: any = {};
  await t('eşleşme listesi/detayı: ortak ilgi, yalnızca iki tarafın seçtiği niyet; kafede olup olmadığı sızmaz', async () => {
    const cafe = await mkCafe('Mesaj Kafe');
    M.a = await quickUser('Aylin'); M.b = await quickUser('Burak'); M.c = await quickUser('Cem');
    const ca = await quickCheckin(M.a, cafe.id), cb = await quickCheckin(M.b, cafe.id);
    const intents = (await q(`SELECT id, slug FROM intents ORDER BY id LIMIT 3`));
    await q(`INSERT INTO checkin_intents VALUES ($1,$2),($1,$3)`, [ca, intents[0].id, intents[1].id]);
    await q(`INSERT INTO checkin_intents VALUES ($1,$2),($1,$3)`, [cb, intents[1].id, intents[2].id]);
    const ints = (await q(`SELECT id FROM interests ORDER BY id LIMIT 3`)).map((r: any) => r.id);
    await q(`INSERT INTO user_interests (user_id, interest_id) VALUES ($1,$2),($1,$3),($4,$3)`, [M.a, ints[0], ints[1], M.b]);
    M.id = (await q(`INSERT INTO matches (user_a_id,user_b_id,cafe_id) VALUES (LEAST($1::uuid,$2::uuid),GREATEST($1::uuid,$2::uuid),$3) RETURNING id`, [M.a, M.b, cafe.id]))[0].id;
    await q(`UPDATE checkins SET ended_at = now() WHERE id = ANY($1::uuid[])`, [[ca, cb]]);   // check-out sonrası da sohbet sürer
    const l: any = await matches.list(M.a);
    assert.equal(l.matches.length, 1);
    assert.equal(l.matches[0].other.user_id, M.b);
    assert.deepEqual(Object.keys(l.matches[0].other).sort(), ['age', 'display_name', 'photo_key', 'photo_verified', 'user_id']);
    const d: any = await matches.detail(M.a, M.id);
    assert.equal(d.common_interests.length, 1);
    assert.deepEqual(d.shared_intents.map((x: any) => x.slug), [intents[1].slug]);
    assert.equal(JSON.stringify(d).includes('visible'), false);
    assert.equal(((await matches.starters(M.a, M.id)) as any).starters.length >= 2, true);
  });
  await t('mesaj gönder/oku: sıralama, sayfalama, okundu, listedeki son mesaj ve okunmamış sayısı', async () => {
    for (let i = 1; i <= 5; i++) await matches.send(i % 2 ? M.a : M.b, M.id, `mesaj ${i}`);
    const p1: any = await matches.messages(M.a, M.id, undefined, 2);
    assert.deepEqual(p1.messages.map((m: any) => m.body), ['mesaj 5', 'mesaj 4']);
    assert.ok(p1.next_before);
    const p2: any = await matches.messages(M.a, M.id, p1.next_before, 10);
    assert.deepEqual(p2.messages.map((m: any) => m.body), ['mesaj 3', 'mesaj 2', 'mesaj 1']);
    assert.equal(p2.next_before, null);
    assert.equal(p1.messages[0].mine, true);   // mesaj 5'i A gönderdi
  });
  await t('okunmamış sayısı ve okundu işaretleme', async () => {
    const before: any = await matches.list(M.b);
    assert.equal(before.matches[0].unread, 3);            // A'nın 1,3,5 numaralı mesajları
    assert.equal(before.matches[0].last_message.from_me, false);
    assert.equal(((await matches.markRead(M.b, M.id)) as any).read, 3);
    assert.equal(((await matches.list(M.b)) as any).matches[0].unread, 0);
    assert.equal(((await matches.list(M.a)) as any).matches[0].unread, 2);
    const ms: any = await matches.messages(M.a, M.id, undefined, 10);
    assert.ok(ms.messages.filter((m: any) => m.mine).every((m: any) => m.read_at !== null));
  });
  await t('iletişim bilgisi engellenmez, işaretlenir ve uyarı döner; boş/çok uzun mesaj reddedilir', async () => {
    const r: any = await matches.send(M.a, M.id, 'instagram: aylin_k');
    assert.equal(r.warning.code, 'CONTACT_INFO');
    assert.equal(await count(`SELECT count(*)::int AS n FROM messages WHERE match_id=$1 AND flagged`, [M.id]), 1);
    assert.equal(await code(matches.send(M.a, M.id, '   ')), 'INVALID_MESSAGE');
    assert.equal(await code(matches.send(M.a, M.id, 'x'.repeat(1001))), 'INVALID_MESSAGE');
  });
  await t('taraf olmayan kişi hiçbir şeye erişemez (aynı MATCH_NOT_FOUND)', async () => {
    assert.equal(await code(matches.detail(M.c, M.id)), 'MATCH_NOT_FOUND');
    assert.equal(await code(matches.messages(M.c, M.id, undefined, 10)), 'MATCH_NOT_FOUND');
    assert.equal(await code(matches.send(M.c, M.id, 'selam')), 'MATCH_NOT_FOUND');
    assert.equal(await code(matches.markRead(M.c, M.id)), 'MATCH_NOT_FOUND');
    assert.equal(await code(matches.end(M.c, M.id)), 'MATCH_NOT_FOUND');
    assert.equal(await code(matches.detail(M.a, randomUUID())), 'MATCH_NOT_FOUND');
  });
  await t('hız sınırı: dakikada 30 mesaj', async () => {
    const k = new MemoryKvStore();
    const svc = new MatchesService(db, k);
    for (let i = 0; i < 30; i++) await svc.send(M.a, M.id, 'hızlı ' + i);
    assert.equal(await code(svc.send(M.a, M.id, 'bir tane daha')), 'TOO_MANY_REQUESTS');
  });
  const mkMatch = async (n1: string, n2: string) => {
    const x = await quickUser(n1), y = await quickUser(n2);
    const cafeId = (await q(`SELECT id FROM cafes WHERE name='Mesaj Kafe'`))[0].id;
    const id = (await q(`INSERT INTO matches (user_a_id,user_b_id,cafe_id) VALUES (LEAST($1::uuid,$2::uuid),GREATEST($1::uuid,$2::uuid),$3) RETURNING id`, [x, y, cafeId]))[0].id;
    return { x, y, id };
  };
  await t('engelleme sohbeti ve listeyi iki taraf için kapatır; eşleşme kapalı kalır (kaldırınca geri gelmez)', async () => {
    const m = await mkMatch('Blok1', 'Blok2');
    await matches.send(m.x, m.id, 'merhaba');
    await blocks.block(m.y, m.x);
    assert.equal(await code(matches.send(m.x, m.id, 'merhaba')), 'MATCH_NOT_FOUND');
    assert.equal(await code(matches.messages(m.y, m.id, undefined, 10)), 'MATCH_NOT_FOUND');
    assert.equal(((await matches.list(m.x)) as any).matches.length, 0);
    assert.equal(((await matches.list(m.y)) as any).matches.length, 0);
    await blocks.unblock(m.y, m.x);
    assert.equal(((await matches.list(m.x)) as any).matches.length, 0);
  });
  await t('pasif karşı taraf: askıya alınınca eşleşme görünmez, geri alınınca döner', async () => {
    const m = await mkMatch('Pasif1', 'Pasif2');
    await q(`UPDATE users SET status='suspended' WHERE id=$1`, [m.y]);
    assert.equal(await code(matches.send(m.x, m.id, 'merhaba')), 'MATCH_NOT_FOUND');
    assert.equal(((await matches.list(m.x)) as any).matches.length, 0);
    await q(`UPDATE users SET status='active' WHERE id=$1`, [m.y]);
    assert.equal(((await matches.list(m.x)) as any).matches.length, 1);
  });
  await t('eşleşmeyi bitirince iki taraf için de kapanır; mesajlar sunucuda kalır', async () => {
    assert.deepEqual(await matches.end(M.a, M.id), { ok: true });
    assert.equal(await code(matches.send(M.b, M.id, 'selam')), 'MATCH_NOT_FOUND');
    assert.equal(await code(matches.detail(M.b, M.id)), 'MATCH_NOT_FOUND');
    assert.ok(await count(`SELECT count(*)::int AS n FROM messages WHERE match_id=$1`, [M.id]) > 5);
  });


  sec('7c. Masama davet et ve Rahatsızım');
  const I: any = {};
  const mkPair = async (n1: string, n2: string, inCafe = true) => {
    const cafeId = (await q(`SELECT id FROM cafes WHERE name='Mesaj Kafe'`))[0].id;
    const x = await quickUser(n1), y = await quickUser(n2);
    const cx = await quickCheckin(x, cafeId, false), cy = inCafe ? await quickCheckin(y, cafeId, false) : null;
    const mid = (await q(`INSERT INTO matches (user_a_id,user_b_id,cafe_id) VALUES (LEAST($1::uuid,$2::uuid),GREATEST($1::uuid,$2::uuid),$3) RETURNING id`, [x, y, cafeId]))[0].id;
    return { x, y, cx, cy, mid, cafeId };
  };
  const point = async (cafeId: string) => (await q(`INSERT INTO cafe_meeting_points (cafe_id,label) VALUES ($1,'Kasanın yanı') RETURNING id`, [cafeId]))[0].id as string;
  await t('davet: gönder → alıcı listede görür; masa yalnızca kabulde açıklanır; aynı eşleşmeye ikinci açık davet yok', async () => {
    I.p = await mkPair('Dava1', 'Dava2'); I.pt = await point(I.p.cafeId);
    assert.equal(((await invitations.meetingPoints(I.p.x)) as any).meeting_points.length >= 1, true);
    const r: any = await invitations.create(I.p.x, I.p.mid, I.pt);
    I.inv = r.invitation.id;
    assert.equal(await code(invitations.create(I.p.x, I.p.mid, I.pt)), 'INVITATION_UNAVAILABLE');
    const inc: any = await invitations.list(I.p.y);
    assert.equal(inc.invitations.length, 1);
    assert.equal(inc.invitations[0].direction, 'incoming');
    const out: any = await invitations.list(I.p.x);
    assert.equal(out.invitations[0].direction, 'outgoing');
    assert.equal(await code(invitations.respond(I.p.x, I.inv, 'accept')), 'INVITATION_NOT_FOUND');   // gönderen kendi davetini kabul edemez
    const ok: any = await invitations.respond(I.p.y, I.inv, 'accept');
    assert.equal(ok.status, 'accepted'); assert.equal(ok.meeting_point, 'Kasanın yanı');
    assert.equal(await code(invitations.respond(I.p.y, I.inv, 'decline')), 'INVITATION_CLOSED');
  });
  await t('karşı taraf kafede değilse davet gönderilemez; yanıt nedenini sızdırmaz; kendi check-in yoksa net hata', async () => {
    const p = await mkPair('Yok1', 'Yok2', false); const pt = await point(p.cafeId);
    assert.equal(await code(invitations.create(p.x, p.mid, pt)), 'INVITATION_UNAVAILABLE');
    await q(`UPDATE checkins SET ended_at = now() WHERE id=$1`, [p.cx]);
    assert.equal(await code(invitations.create(p.x, p.mid, pt)), 'NO_ACTIVE_CHECKIN');
  });
  await t('başka kafenin/pasif buluşma noktası reddedilir; taraf olmayan eşleşmeye davet atamaz', async () => {
    const p = await mkPair('Nok1', 'Nok2'); const other = await mkCafe('Başka Kafe');
    const foreign = await point(other.id);
    assert.equal(await code(invitations.create(p.x, p.mid, foreign)), 'MEETING_POINT_NOT_FOUND');
    const stranger = await quickUser('Yabanci'); await quickCheckin(stranger, p.cafeId, false);
    assert.equal(await code(invitations.create(stranger, p.mid, await point(p.cafeId))), 'MATCH_NOT_FOUND');
  });
  await t('"sonra": gönderen bekliyor görür; alıcı sonradan kabul edebilir; ret sonrası 3 saat yeniden davet yok', async () => {
    const p = await mkPair('Son1', 'Son2'); const pt = await point(p.cafeId);
    const inv = ((await invitations.create(p.x, p.mid, pt)) as any).invitation.id;
    assert.equal(((await invitations.respond(p.y, inv, 'later')) as any).status, 'later');
    assert.equal(((await invitations.list(p.x)) as any).invitations[0].status, 'pending');
    assert.equal(((await invitations.list(p.y)) as any).invitations[0].status, 'later');
    assert.equal(((await invitations.respond(p.y, inv, 'decline')) as any).status, 'declined');
    assert.equal(((await invitations.list(p.x)) as any).invitations.length, 0);
    assert.equal(await code(invitations.create(p.x, p.mid, pt)), 'INVITATION_COOLDOWN');
  });
  await t('bekleyen davet 15 dakikada geçersiz olur; bakım işi expired yapar', async () => {
    const p = await mkPair('Sure1', 'Sure2'); const pt = await point(p.cafeId);
    const inv = ((await invitations.create(p.x, p.mid, pt)) as any).invitation.id;
    await q(`UPDATE invitations SET created_at = now() - interval '16 minutes' WHERE id=$1`, [inv]);
    assert.equal(((await invitations.list(p.y)) as any).invitations.length, 0);
    assert.equal(await code(invitations.respond(p.y, inv, 'accept')), 'INVITATION_NOT_FOUND');
    await new CheckinsMaintenanceService(db).tick();
    assert.equal((await q(`SELECT status FROM invitations WHERE id=$1`, [inv]))[0].status, 'expired');
  });
  await t('check-out iki taraf için de açık davetleri iptal eder', async () => {
    const p = await mkPair('Out1', 'Out2'); const pt = await point(p.cafeId);
    const inv = ((await invitations.create(p.x, p.mid, pt)) as any).invitation.id;
    await invitations.respond(p.y, inv, 'accept');
    await checkins.end(p.y);
    assert.equal((await q(`SELECT status FROM invitations WHERE id=$1`, [inv]))[0].status, 'cancelled');
    assert.equal(((await invitations.list(p.x)) as any).invitations.length, 0);
  });
  await t('check-in süresi dolan taraf: davet anında görünmez, bakım işi iptal eder', async () => {
    const p = await mkPair('Exp1', 'Exp2'); const pt = await point(p.cafeId);
    const inv = ((await invitations.create(p.x, p.mid, pt)) as any).invitation.id;
    await q(`UPDATE checkins SET started_at = now() - interval '4 hours', expires_at = now() - interval '1 hour' WHERE id=$1`, [p.cy]);
    assert.equal(((await invitations.list(p.x)) as any).invitations.length, 0);
    await new CheckinsMaintenanceService(db).tick();
    assert.equal((await q(`SELECT status FROM invitations WHERE id=$1`, [inv]))[0].status, 'cancelled');
  });
  await t('gönderen iptal eder; engelleme açık daveti iptal eder', async () => {
    const p = await mkPair('Iptal1', 'Iptal2'); const pt = await point(p.cafeId);
    const inv = ((await invitations.create(p.x, p.mid, pt)) as any).invitation.id;
    assert.deepEqual(await invitations.cancel(p.x, inv), { ok: true });
    assert.equal(await code(invitations.cancel(p.x, inv)), 'INVITATION_NOT_FOUND');
    const p2 = await mkPair('Blk1', 'Blk2'); const pt2 = await point(p2.cafeId);
    const inv2 = ((await invitations.create(p2.x, p2.mid, pt2)) as any).invitation.id;
    await blocks.block(p2.y, p2.x);
    assert.equal((await q(`SELECT status FROM invitations WHERE id=$1`, [inv2]))[0].status, 'cancelled');
  });
  await t('davet hız sınırı: saatte 10', async () => {
    const k = new MemoryKvStore(); const svc = new InvitationsService(db, checkins, k);
    const p = await mkPair('Hiz1', 'Hiz2');
    let last = '';
    for (let i = 0; i < 11; i++) last = (await code(svc.create(p.x, p.mid, randomUUID()))) ?? 'ok';
    assert.equal(last, 'TOO_MANY_REQUESTS');
  });
  await t('Rahatsızım: engeller, eşleşme ve davetleri kapatır, yüksek öncelikli şikâyet açar; karşı tarafa iz bırakmaz', async () => {
    const p = await mkPair('Rhs1', 'Rhs2'); const pt = await point(p.cafeId);
    const inv = ((await invitations.create(p.y, p.mid, pt)) as any).invitation.id;
    const r: any = await safety.alert(p.x, { invitation_id: inv, notify_cafe: true });
    assert.deepEqual(r, { ok: true, blocked: true, cafe_notified: true, emergency_number: '112' });
    assert.equal(await count(`SELECT count(*)::int AS n FROM blocks WHERE blocker_id=$1 AND blocked_id=$2`, [p.x, p.y]), 1);
    assert.equal((await q(`SELECT status FROM matches WHERE id=$1`, [p.mid]))[0].status, 'blocked');
    assert.equal((await q(`SELECT status FROM invitations WHERE id=$1`, [inv]))[0].status, 'cancelled');
    const rep = (await q(`SELECT context, priority, reason FROM reports WHERE reporter_id=$1 AND reported_id=$2`, [p.x, p.y]))[0];
    assert.deepEqual(rep, { context: 'invitation', priority: 3, reason: 'safety_alert' });
    const al = (await q(`SELECT notify_cafe, cafe_id FROM safety_alerts WHERE user_id=$1`, [p.x]))[0];
    assert.equal(al.notify_cafe, true); assert.equal(al.cafe_id, p.cafeId);
    assert.equal(((await matches.list(p.y)) as any).matches.length, 0);
    await q(`UPDATE checkins SET visible = true WHERE id = ANY($1::uuid[])`, [[p.cx, p.cy]]);
    assert.equal((await ids(p.y)).includes(p.x), false);   // engelli çift keşifte de birbirini görmez
  });
  await t('Rahatsızım: kafe bildirimi yalnızca açıkça istenirse; kişi vermeden de çalışır; yabancıyı işaretleyemez', async () => {
    const p = await mkPair('Rhs3', 'Rhs4');
    const r1: any = await safety.alert(p.x, { other_user_id: p.y });
    assert.equal(r1.cafe_notified, false); assert.equal(r1.blocked, true);
    const solo = await mkPair('Rhs5', 'Rhs6');
    const r2: any = await safety.alert(solo.x, { notify_cafe: true });
    assert.equal(r2.blocked, false); assert.equal(r2.cafe_notified, true);
    assert.equal(await count(`SELECT count(*)::int AS n FROM reports WHERE reporter_id=$1`, [solo.x]), 0);
    const stranger = await quickUser('Rhs7');
    assert.equal(await code(safety.alert(solo.x, { other_user_id: stranger })), 'TARGET_UNAVAILABLE');
    assert.equal(await code(safety.alert(solo.x, { other_user_id: solo.x })), 'TARGET_UNAVAILABLE');
    assert.equal(await code(safety.alert(solo.x, { invitation_id: randomUUID() })), 'INVITATION_NOT_FOUND');
  });
  await t('Rahatsızım: check-in yoksa NO_ACTIVE_CHECKIN; saatte 5 sınır', async () => {
    const lone = await quickUser('Rhs8');
    assert.equal(await code(safety.alert(lone, {})), 'NO_ACTIVE_CHECKIN');
    const k = new MemoryKvStore(); const svc = new SafetyService(db, checkins, k);
    const p = await mkPair('Rhs9', 'Rhs10');
    let last = '';
    for (let i = 0; i < 6; i++) last = (await code(svc.alert(p.x, { notify_cafe: true }))) ?? 'ok';
    assert.equal(last, 'TOO_MANY_REQUESTS');
  });


  sec('7d. Şikâyet');
  await t('şikâyet: eşleşilmiş/aynı kafedeki kişi için açılır; öncelik nedene göre; kanıt mesajı doğrulanır', async () => {
    const p = await mkPair('Sik1', 'Sik2');
    const mg = (await q(`INSERT INTO messages (match_id, sender_id, body) VALUES ($1,$2,'kötü söz') RETURNING id`, [p.mid, p.y]))[0].id;
    assert.deepEqual(await reports.create(p.x, { reported_user_id: p.y, context: 'chat', reason: 'harassment', message_id: mg, details: ' ayrıntı ' }), { ok: true });
    const r = (await q(`SELECT context, reason, priority, message_id, details, status FROM reports WHERE reporter_id=$1`, [p.x]))[0];
    assert.deepEqual(r, { context: 'chat', reason: 'harassment', priority: 2, message_id: mg, details: 'ayrıntı', status: 'open' });
    // sahte kanıt: şikâyet edenin kendi mesajı ya da başka sohbetin mesajı kabul edilmez
    const own = (await q(`INSERT INTO messages (match_id, sender_id, body) VALUES ($1,$2,'x') RETURNING id`, [p.mid, p.x]))[0].id;
    assert.equal(await code(reports.create(p.x, { reported_user_id: p.y, context: 'chat', reason: 'spam', message_id: own })), 'TARGET_UNAVAILABLE');
  });
  await t('tekrar eden açık şikâyet yeni satır açmaz, yanıt aynıdır; kendini ve ilişkisiz kişiyi şikâyet edemez', async () => {
    const p = await mkPair('Sik3', 'Sik4');
    await reports.create(p.x, { reported_user_id: p.y, context: 'profile', reason: 'spam' });
    assert.deepEqual(await reports.create(p.x, { reported_user_id: p.y, context: 'profile', reason: 'fake_account' }), { ok: true });
    assert.equal(await count(`SELECT count(*)::int AS n FROM reports WHERE reporter_id=$1`, [p.x]), 1);
    assert.equal(await code(reports.create(p.x, { reported_user_id: p.x, context: 'profile', reason: 'spam' })), 'INVALID_REPORT');
    const stranger = await quickUser('Sik5');
    assert.equal(await code(reports.create(p.x, { reported_user_id: stranger, context: 'profile', reason: 'spam' })), 'TARGET_UNAVAILABLE');
    assert.equal(await code(reports.create(p.x, { reported_user_id: randomUUID(), context: 'profile', reason: 'spam' })), 'TARGET_UNAVAILABLE');
    assert.equal(await code(reports.create(p.x, { reported_user_id: p.y, context: 'invitation', reason: 'spam' })), 'TARGET_UNAVAILABLE'); // aralarında davet yok
  });
  await t('şikâyet + engelle birlikte; günlük 10 şikâyet sınırı', async () => {
    const p = await mkPair('Sik6', 'Sik7');
    await reports.create(p.x, { reported_user_id: p.y, context: 'profile', reason: 'inappropriate_photo', block: true });
    assert.equal(await count(`SELECT count(*)::int AS n FROM blocks WHERE blocker_id=$1 AND blocked_id=$2`, [p.x, p.y]), 1);
    assert.equal((await q(`SELECT status FROM matches WHERE id=$1`, [p.mid]))[0].status, 'blocked');
    const k = new MemoryKvStore(); const svc = new ReportsService(db, k);
    let last = '';
    for (let i = 0; i < 11; i++) last = (await code(svc.create(p.x, { reported_user_id: p.y, context: 'profile', reason: 'spam' }))) ?? 'ok';
    assert.equal(last, 'TOO_MANY_REQUESTS');
  });


  sec('7e. Yönetici girişi ve şikâyet kuyruğu');
  const AD: any = {};
  await t('parola özeti: doğru parola geçer, yanlışı ve bozuk özeti reddeder; her özet farklı tuz kullanır', async () => {
    const h = await hashPassword('doğru-parola-123');
    assert.ok(h.startsWith('scrypt$'));
    assert.equal(await verifyPassword('doğru-parola-123', h), true);
    assert.equal(await verifyPassword('yanlış', h), false);
    assert.equal(await verifyPassword('x', 'bozuk'), false);
    assert.notEqual(h, await hashPassword('doğru-parola-123'));
  });
  await t('giriş: doğru bilgilerle token; yanlış parola ve olmayan hesap aynı hata; devre dışı hesap giremez', async () => {
    const hash = await hashPassword('Cok-Guclu-Parola-1');
    AD.mod = (await q(`INSERT INTO admins (email, password_hash, display_name, role) VALUES ('mod@firma.com',$1,'Moderatör','moderator') RETURNING id`, [hash]))[0].id;
    AD.off = (await q(`INSERT INTO admins (email, password_hash, display_name, role, status) VALUES ('off@firma.com',$1,'Kapalı','moderator','disabled') RETURNING id`, [hash]))[0].id;
    const ok: any = await adminAuth.login(' MOD@firma.com ', 'Cok-Guclu-Parola-1', '9.9.9.1');
    AD.token = ok.access_token;
    assert.equal(ok.admin.role, 'moderator');
    assert.ok((await q(`SELECT last_login_at FROM admins WHERE id=$1`, [AD.mod]))[0].last_login_at);
    assert.equal(await code(adminAuth.login('mod@firma.com', 'yanlis', '9.9.9.2')), 'INVALID_CREDENTIALS');
    assert.equal(await code(adminAuth.login('yok@firma.com', 'Cok-Guclu-Parola-1', '9.9.9.2')), 'INVALID_CREDENTIALS');
    assert.equal(await code(adminAuth.login('off@firma.com', 'Cok-Guclu-Parola-1', '9.9.9.2')), 'INVALID_CREDENTIALS');
  });
  await t('5 hatalı denemeden sonra hesap kilitlenir (doğru parola da girmez); IP başına 20 deneme sınırı', async () => {
    const hash = await hashPassword('Baska-Parola-12345');
    await q(`INSERT INTO admins (email, password_hash, display_name) VALUES ('kilit@firma.com',$1,'Kilit')`, [hash]);
    for (let i = 0; i < 5; i++) assert.equal(await code(adminAuth.login('kilit@firma.com', 'x', '8.8.8.8')), 'INVALID_CREDENTIALS');
    assert.equal(await code(adminAuth.login('kilit@firma.com', 'Baska-Parola-12345', '8.8.8.8')), 'TOO_MANY_REQUESTS');
    let last = '';
    for (let i = 0; i < 21; i++) last = (await code(adminAuth.login(`k${i}@firma.com`, 'x', '7.7.7.7'))) ?? 'ok';
    assert.equal(last, 'TOO_MANY_REQUESTS');
  });
  await t('guard: admin token kabul; kullanıcı token\'ı admin ucuna, admin token\'ı kullanıcı ucuna giremez; devre dışı admin düşer', async () => {
    const a = reqWith('Bearer ' + AD.token);
    assert.equal(await adminGuard.canActivate(a.ctx), true);
    assert.equal(a.req.admin.id, AD.mod);
    assert.equal(await code(guard.canActivate(reqWith('Bearer ' + AD.token).ctx)), 'UNAUTHORIZED');   // admin → kullanıcı ucu
    const userTok = await jwt.signAsync({ sub: U.A.id, role: 'user', typ: 'access' }, { expiresIn: 60 });
    assert.equal(await code(adminGuard.canActivate(reqWith('Bearer ' + userTok).ctx)), 'UNAUTHORIZED');  // kullanıcı → admin ucu
    assert.equal(await code(adminGuard.canActivate(reqWith().ctx)), 'UNAUTHORIZED');
    await q(`UPDATE admins SET status='disabled' WHERE id=$1`, [AD.mod]);
    assert.equal(await code(adminGuard.canActivate(reqWith('Bearer ' + AD.token).ctx)), 'UNAUTHORIZED');
    await q(`UPDATE admins SET status='active' WHERE id=$1`, [AD.mod]);
  });
  await t('kuyruk: öncelik sonra eskilik sırası; başkasının telefon/e-postası dönmez; durum filtresi', async () => {
    await q(`DELETE FROM reports`);
    const p1 = await mkPair('Kuy1', 'Kuy2'), p2 = await mkPair('Kuy3', 'Kuy4'), p3 = await mkPair('Kuy5', 'Kuy6');
    await reports.create(p1.x, { reported_user_id: p1.y, context: 'profile', reason: 'spam' });
    await reports.create(p2.x, { reported_user_id: p2.y, context: 'profile', reason: 'harassment' });
    await reports.create(p3.x, { reported_user_id: p3.y, context: 'profile', reason: 'spam' });
    await q(`UPDATE reports SET created_at = now() - interval '1 hour' WHERE reporter_id=$1`, [p3.x]);
    const qr: any = await adminReports.queue();
    assert.deepEqual(qr.reports.map((r: any) => r.reason), ['harassment', 'spam', 'spam']);
    assert.equal(qr.reports[1].reporter_id, p3.x);               // aynı öncelikte eski olan önce
    const json = JSON.stringify(qr);
    assert.equal(/phone|email|birth/.test(json), false);
    assert.equal(((await adminReports.queue('closed')) as any).reports.length, 0);
    assert.equal(((await adminReports.queue('open', 2, 0)) as any).reports.length, 2);
    assert.equal(((await adminReports.queue('open', 2, 2)) as any).reports.length, 1);
  });
  await t('ayrıntı: profil, kanıt sohbeti (±30 dk), diğer şikâyetler; kanıt erişimi denetim izine yazılır; telefon yok', async () => {
    const p = await mkPair('Det1', 'Det2');
    const m1 = (await q(`INSERT INTO messages (match_id,sender_id,body,created_at) VALUES ($1,$2,'selam',now() - interval '5 minutes') RETURNING id`, [p.mid, p.x]))[0].id;
    const bad = (await q(`INSERT INTO messages (match_id,sender_id,body,created_at) VALUES ($1,$2,'kötü mesaj',now() - interval '4 minutes') RETURNING id`, [p.mid, p.y]))[0].id;
    await q(`INSERT INTO messages (match_id,sender_id,body,created_at) VALUES ($1,$2,'çok eski',now() - interval '3 hours')`, [p.mid, p.x]);
    await reports.create(p.x, { reported_user_id: p.y, context: 'chat', reason: 'harassment', message_id: bad });
    const rid = (await q(`SELECT id FROM reports WHERE reporter_id=$1`, [p.x]))[0].id;
    const d: any = await adminReports.detail(AD.mod, rid);
    assert.equal(d.reported.display_name, 'Det2');
    assert.deepEqual(d.evidence.map((e: any) => [e.body, e.from, e.is_reported_message]), [['selam', 'reporter', false], ['kötü mesaj', 'reported', true]]);
    assert.equal(/phone|email|birth/.test(JSON.stringify(d)), false);
    assert.equal(await count(`SELECT count(*)::int AS n FROM moderation_actions WHERE admin_id=$1 AND report_id=$2 AND action='view_evidence'`, [AD.mod, rid]), 1);
    assert.equal(await code(adminReports.detail(AD.mod, randomUUID())), 'REPORT_NOT_FOUND');
    // kanıtsız şikâyette denetim kaydı yazılmaz
    const p2 = await mkPair('Det3', 'Det4');
    await reports.create(p2.x, { reported_user_id: p2.y, context: 'profile', reason: 'spam' });
    const rid2 = (await q(`SELECT id FROM reports WHERE reporter_id=$1`, [p2.x]))[0].id;
    assert.equal(((await adminReports.detail(AD.mod, rid2)) as any).evidence, null);
    assert.equal(await count(`SELECT count(*)::int AS n FROM moderation_actions WHERE report_id=$1`, [rid2]), 0);
  });


  sec('7f. Moderasyon kararları');
  const mod = { id: '', role: 'moderator' as const }, boss = { id: '', role: 'admin' as const };
  const reportOf = async (reporter: string) => (await q(`SELECT id FROM reports WHERE reporter_id=$1 ORDER BY created_at DESC LIMIT 1`, [reporter]))[0].id as string;
  await t('hazırlık: moderatör ve yönetici hesapları', async () => {
    const h = await hashPassword('Cok-Guclu-Parola-1');
    mod.id = (await q(`INSERT INTO admins (email,password_hash,display_name,role) VALUES ('m2@firma.com',$1,'M2','moderator') RETURNING id`, [h]))[0].id;
    boss.id = (await q(`INSERT INTO admins (email,password_hash,display_name,role) VALUES ('b2@firma.com',$1,'B2','admin') RETURNING id`, [h]))[0].id;
  });
  await t('dismiss: şikâyet kapanır, kullanıcıya dokunulmaz; kapalı şikâyet ikinci kez işlenemez; olmayan şikâyet 404', async () => {
    const p = await mkPair('Kar1', 'Kar2');
    await reports.create(p.x, { reported_user_id: p.y, context: 'profile', reason: 'spam' });
    const rid = await reportOf(p.x);
    assert.deepEqual(await adminActions.resolve(mod, rid, 'dismiss'), { ok: true, status: 'dismissed' });
    assert.equal((await q(`SELECT status FROM users WHERE id=$1`, [p.y]))[0].status, 'active');
    assert.equal(await code(adminActions.resolve(mod, rid, 'warn', 'tekrar')), 'REPORT_CLOSED');
    assert.equal(await code(adminActions.resolve(mod, randomUUID(), 'dismiss')), 'REPORT_NOT_FOUND');
    assert.equal(await count(`SELECT count(*)::int AS n FROM moderation_actions WHERE report_id=$1 AND action='dismiss'`, [rid]), 1);
  });
  await t('warn ve gerekçe zorunluluğu: gerekçesiz işlem reddedilir ve şikâyet açık kalır', async () => {
    const p = await mkPair('Kar3', 'Kar4');
    await reports.create(p.x, { reported_user_id: p.y, context: 'profile', reason: 'spam' });
    const rid = await reportOf(p.x);
    assert.equal(await code(adminActions.resolve(mod, rid, 'warn')), 'NOTE_REQUIRED');
    assert.equal(await code(adminActions.resolve(mod, rid, 'suspend', ' ')), 'NOTE_REQUIRED');
    assert.equal((await q(`SELECT status FROM reports WHERE id=$1`, [rid]))[0].status, 'open');
    assert.deepEqual(await adminActions.resolve(mod, rid, 'warn', 'ilk uyarı'), { ok: true, status: 'actioned' });
    assert.equal((await q(`SELECT status FROM users WHERE id=$1`, [p.y]))[0].status, 'active');
  });
  await t('suspend: hesap askıya alınır, check-in kapanır, davetler iptal olur, oturumlar kapanır, guard hemen engeller; denetim kaydı yazılır', async () => {
    const p = await mkPair('Kar5', 'Kar6'); const pt = await point(p.cafeId);
    const inv = ((await invitations.create(p.x, p.mid, pt)) as any).invitation.id;
    const sess = await tokens.issue(p.y);
    await reports.create(p.x, { reported_user_id: p.y, context: 'profile', reason: 'harassment' });
    const rid = await reportOf(p.x);
    await adminActions.resolve(mod, rid, 'suspend', 'tekrarlayan taciz');
    assert.equal((await q(`SELECT status FROM users WHERE id=$1`, [p.y]))[0].status, 'suspended');
    assert.equal((await q(`SELECT ended_at IS NOT NULL AS e FROM checkins WHERE id=$1`, [p.cy]))[0].e, true);
    assert.equal((await q(`SELECT status FROM invitations WHERE id=$1`, [inv]))[0].status, 'cancelled');
    assert.equal(await code(tokens.rotate(sess.refresh_token)), 'TOKEN_INVALID');
    assert.equal(await code(guard.canActivate(reqWith('Bearer ' + sess.access_token).ctx)), 'ACCOUNT_DISABLED');
    const act = (await q(`SELECT admin_id, action, note FROM moderation_actions WHERE report_id=$1`, [rid]))[0];
    assert.deepEqual(act, { admin_id: mod.id, action: 'suspend', note: 'tekrarlayan taciz' });
    assert.equal(await code(adminActions.resolve(mod, rid, 'dismiss')), 'REPORT_CLOSED');
  });
  await t('ban: moderatör yapamaz (403, şikâyet açık kalır), yönetici yapar; silinmiş hesap için işlem reddedilir ve geri alınır', async () => {
    const p = await mkPair('Kar7', 'Kar8');
    await reports.create(p.x, { reported_user_id: p.y, context: 'profile', reason: 'fake_account' });
    const rid = await reportOf(p.x);
    assert.equal(await code(adminActions.resolve(mod, rid, 'ban', 'sahte')), 'FORBIDDEN');
    assert.equal((await q(`SELECT status FROM reports WHERE id=$1`, [rid]))[0].status, 'open');
    await adminActions.resolve(boss, rid, 'ban', 'sahte hesap doğrulandı');
    assert.equal((await q(`SELECT status FROM users WHERE id=$1`, [p.y]))[0].status, 'banned');
    const p2 = await mkPair('Kar9', 'Kar10');
    await reports.create(p2.x, { reported_user_id: p2.y, context: 'profile', reason: 'spam' });
    const rid2 = await reportOf(p2.x);
    await q(`UPDATE users SET status='deleted' WHERE id=$1`, [p2.y]);
    assert.equal(await code(adminActions.resolve(boss, rid2, 'suspend', 'x yy')), 'USER_UNAVAILABLE');
    assert.equal((await q(`SELECT status FROM reports WHERE id=$1`, [rid2]))[0].status, 'open');   // işlem geri alındı
  });
  await t('restore: askıdaki hesabı moderatör açar; yasağı yalnızca yönetici; gerekçe şart; aktif hesap için reddedilir', async () => {
    const a = await quickUser('Res1'), b = await quickUser('Res2');
    await q(`UPDATE users SET status='suspended' WHERE id=$1`, [a]);
    await q(`UPDATE users SET status='banned' WHERE id=$1`, [b]);
    assert.equal(await code(adminActions.restore(mod, a, '')), 'NOTE_REQUIRED');
    assert.deepEqual(await adminActions.restore(mod, a, 'itiraz haklı bulundu'), { ok: true });
    assert.equal((await q(`SELECT status FROM users WHERE id=$1`, [a]))[0].status, 'active');
    assert.equal(await code(adminActions.restore(mod, b, 'itiraz haklı')), 'FORBIDDEN');
    assert.deepEqual(await adminActions.restore(boss, b, 'itiraz haklı'), { ok: true });
    assert.equal(await code(adminActions.restore(boss, a, 'zaten aktif')), 'USER_UNAVAILABLE');
    assert.equal(await count(`SELECT count(*)::int AS n FROM moderation_actions WHERE user_id=$1 AND action='restore'`, [b]), 1);
  });
  await t('Rahatsızım kuyruğu: işlenmemişler önce; işleyince kuyruktan düşer, ikinci kez 404; denetim kaydı', async () => {
    await q(`DELETE FROM safety_alerts`);
    const p = await mkPair('Uyr1', 'Uyr2');
    await safety.alert(p.x, { other_user_id: p.y, notify_cafe: true });
    const l: any = await adminActions.alerts();
    assert.equal(l.alerts.length, 1);
    assert.equal(l.alerts[0].notify_cafe, true); assert.equal(l.alerts[0].other_name, 'Uyr2'); assert.equal(l.alerts[0].cafe_name, 'Mesaj Kafe');
    assert.equal(/phone|email|birth/.test(JSON.stringify(l)), false);
    assert.deepEqual(await adminActions.handleAlert(mod, l.alerts[0].id), { ok: true });
    assert.equal(((await adminActions.alerts()) as any).alerts.length, 0);
    assert.equal(((await adminActions.alerts(false)) as any).alerts.length, 1);
    assert.equal(await code(adminActions.handleAlert(mod, l.alerts[0].id)), 'ALERT_NOT_FOUND');
    assert.equal(await count(`SELECT count(*)::int AS n FROM moderation_actions WHERE action='alert_handled' AND admin_id=$1`, [mod.id]), 1);
  });


  sec('7g. Fotoğraf yükleme');
  const PH: any = {};
  await t('yükleme: üst veri silinir, rastgele adla saklanır, pending başlar; sahibi listeler', async () => {
    PH.a = await quickUser('Foto1'); PH.b = await quickUser('Foto2');
    const src = makeJpeg(640, 480, { exif: 'GPS-41.0082N', comment: 'seri-no', trailing: 'EK' });
    const r: any = await photos.upload(PH.a, src, 'image/jpeg');
    assert.equal(r.photo.moderation, 'pending'); assert.equal(r.photo.position, 0);
    const row = (await q(`SELECT storage_key FROM user_photos WHERE id=$1`, [r.photo.id]))[0];
    assert.match(row.storage_key, /^[0-9a-f-]{36}\.jpg$/);
    const saved = store.files.get(row.storage_key)!.toString('latin1');
    assert.equal(saved.includes('GPS-41') || saved.includes('seri-no'), false);
    PH.id = r.photo.id; PH.key = row.storage_key;
    assert.equal(((await photos.list(PH.a)) as any).photos.length, 1);
    assert.equal(((await photos.list(PH.b)) as any).photos.length, 0);
  });
  await t('reddedilenler: yanlış tür/beyan, sahte dosya, çok büyük, boş, küçük görsel; hiçbiri satır veya dosya bırakmaz', async () => {
    const before = store.files.size;
    assert.equal(await code(photos.upload(PH.a, makeJpeg(300, 300), 'image/png')), 'INVALID_IMAGE');      // beyan ≠ gerçek tür
    assert.equal(await code(photos.upload(PH.a, Buffer.from('<svg/>'), 'image/jpeg')), 'INVALID_IMAGE');
    assert.equal(await code(photos.upload(PH.a, makeJpeg(300, 300), 'image/gif')), 'UNSUPPORTED_MEDIA');
    assert.equal(await code(photos.upload(PH.a, Buffer.alloc(0), 'image/jpeg')), 'UNSUPPORTED_MEDIA');
    assert.equal(await code(photos.upload(PH.a, { not: 'buffer' }, 'image/jpeg')), 'UNSUPPORTED_MEDIA');
    assert.equal(await code(photos.upload(PH.a, Buffer.alloc(5 * 1024 * 1024 + 1), 'image/jpeg')), 'PHOTO_TOO_LARGE');
    assert.equal(await code(photos.upload(PH.a, makeJpeg(100, 100), 'image/jpeg')), 'IMAGE_TOO_SMALL');
    assert.equal(store.files.size, before);
    assert.equal(await count(`SELECT count(*)::int AS n FROM user_photos WHERE user_id=$1`, [PH.a]), 1);
  });
  await t('en fazla 6 fotoğraf (reddedilen yer kaplamaz); sınırı aşan yüklemenin dosyası geri silinir; günlük 10 sınırı', async () => {
    const u = await quickUser('Foto3');
    for (let i = 0; i < 6; i++) await photos.upload(u, makePng(300, 300), 'image/png');
    const files = store.files.size;
    assert.equal(await code(photos.upload(u, makePng(300, 300), 'image/png')), 'PHOTO_LIMIT');
    assert.equal(store.files.size, files);
    await q(`UPDATE user_photos SET moderation='rejected' WHERE id = (SELECT id FROM user_photos WHERE user_id=$1 LIMIT 1)`, [u]);
    assert.ok(await photos.upload(u, makePng(300, 300), 'image/png'));
    const k = new MemoryKvStore(); const svc = new PhotosService(db, store, k);
    const w = await quickUser('Foto4'); let last = '';
    for (let i = 0; i < 11; i++) last = (await code(svc.upload(w, 'x', 'image/jpeg'))) ?? 'ok';
    assert.equal(last, 'TOO_MANY_REQUESTS');
  });
  await t('erişim: sahibi her durumda görür; başkası pending/rejected göremez, onaylıyı görür; engelli ve pasif hesap göremez; yol gezme reddedilir', async () => {
    assert.equal((await photos.file(PH.a, PH.key)).contentType, 'image/jpeg');
    assert.equal(await code(photos.file(PH.b, PH.key)), 'PHOTO_NOT_FOUND');          // pending
    await q(`UPDATE user_photos SET moderation='approved' WHERE id=$1`, [PH.id]);
    assert.equal((await photos.file(PH.b, PH.key)).data.length > 0, true);
    await blocks.block(PH.b, PH.a);
    assert.equal(await code(photos.file(PH.b, PH.key)), 'PHOTO_NOT_FOUND');          // iki yönlü engel
    assert.ok((await photos.file(PH.a, PH.key)).data.length > 0);                     // sahibi kendi fotoğrafını görmeye devam eder
    await blocks.unblock(PH.b, PH.a);
    await q(`UPDATE user_photos SET moderation='rejected' WHERE id=$1`, [PH.id]);
    assert.equal(await code(photos.file(PH.b, PH.key)), 'PHOTO_NOT_FOUND');          // reddedildi
    await q(`UPDATE user_photos SET moderation='approved' WHERE id=$1`, [PH.id]);
    await q(`UPDATE users SET status='suspended' WHERE id=$1`, [PH.a]);
    assert.equal(await code(photos.file(PH.b, PH.key)), 'PHOTO_NOT_FOUND');          // pasif hesap
    await q(`UPDATE users SET status='active' WHERE id=$1`, [PH.a]);
    for (const bad of ['../etc/passwd', '..%2f..%2fx', 'x.jpg', PH.key + '/../x', PH.key.replace('.jpg', '.exe')]) {
      assert.equal(await code(photos.file(PH.a, bad)), 'PHOTO_NOT_FOUND', bad);
    }
  });
  await t('silme: yalnızca sahibi; satır ve dosya birlikte gider', async () => {
    assert.equal(await code(photos.remove(PH.b, PH.id)), 'PHOTO_NOT_FOUND');
    await photos.remove(PH.a, PH.id);
    assert.equal(store.files.has(PH.key), false);
    assert.equal(await count(`SELECT count(*)::int AS n FROM user_photos WHERE id=$1`, [PH.id]), 0);
    assert.equal(await code(photos.remove(PH.a, PH.id)), 'PHOTO_NOT_FOUND');
  });
  await t('onaylı fotoğraf şartı açıkken: yükleyen pending iken görünür olamaz, onaydan sonra olabilir', async () => {
    const cafe = await mkCafe('Foto Kafe');
    const u = await quickUser('Foto5'); await quickCheckin(u, cafe.id, false);
    const strict = new CheckinsService(db, kv, { ...cfg, requireApprovedPhoto: true });
    assert.equal(await code(strict.setVisibility(u, true)), 'PHOTO_REQUIRED');
    const r: any = await photos.upload(u, makeJpeg(400, 400), 'image/jpeg');
    assert.equal(await code(strict.setVisibility(u, true)), 'PHOTO_REQUIRED');
    await q(`UPDATE user_photos SET moderation='approved' WHERE id=$1`, [r.photo.id]);
    await strict.setVisibility(u, true);
    assert.equal((await q(`SELECT visible FROM checkins WHERE user_id=$1 AND ended_at IS NULL`, [u]))[0].visible, true);
  });


  sec('7h. Fotoğraf moderasyonu ve hesap silmede temizlik');
  await t('kuyruk: en eski bekleyen önce; iletişim bilgisi yok; admin dosyayı görür', async () => {
    await q(`DELETE FROM user_photos`); store.files.clear();
    const a = await quickUser('Mod1'), b = await quickUser('Mod2');
    const pa: any = await photos.upload(a, makeJpeg(400, 400), 'image/jpeg');
    const pb: any = await photos.upload(b, makePng(400, 400), 'image/png');
    await q(`UPDATE user_photos SET created_at = now() - interval '1 hour' WHERE id=$1`, [pb.photo.id]);
    const l: any = await adminPhotos.queue();
    assert.deepEqual(l.photos.map((x: any) => x.id), [pb.photo.id, pa.photo.id]);
    assert.equal(/phone|email|birth|storage_key/.test(JSON.stringify(l)), false);
    assert.equal((await adminPhotos.file(pa.photo.id)).contentType, 'image/jpeg');
    assert.equal(await code(adminPhotos.file(randomUUID())), 'PHOTO_NOT_FOUND');
    PH.m = { a, b, pa: pa.photo.id, pb: pb.photo.id };
  });
  await t('onay: pending → approved, denetim kaydı; ikinci onay 409; onaylı fotoğraf başkasına görünür', async () => {
    const adm = { id: boss.id, role: 'admin' as const };
    assert.deepEqual(await adminPhotos.review(adm, PH.m.pa, 'approve'), { ok: true, moderation: 'approved' });
    assert.equal(await code(adminPhotos.review(adm, PH.m.pa, 'approve')), 'PHOTO_CLOSED');
    assert.equal(await count(`SELECT count(*)::int AS n FROM moderation_actions WHERE user_id=$1 AND action='photo_approve'`, [PH.m.a]), 1);
    const key = (await q(`SELECT storage_key FROM user_photos WHERE id=$1`, [PH.m.pa]))[0].storage_key;
    assert.ok((await photos.file(PH.m.b, key)).data.length > 0);
    assert.equal(((await adminPhotos.queue('pending')) as any).photos.length, 1);
  });
  await t('ret: gerekçe şart; dosya depodan silinir, satır rejected kalır; sonradan onaylı fotoğraf da reddedilebilir; ret sonrası onay yok', async () => {
    const adm = { id: mod.id, role: 'moderator' as const };
    const key = (await q(`SELECT storage_key FROM user_photos WHERE id=$1`, [PH.m.pb]))[0].storage_key;
    assert.equal(await code(adminPhotos.review(adm, PH.m.pb, 'reject')), 'NOTE_REQUIRED');
    assert.equal(store.files.has(key), true);
    assert.deepEqual(await adminPhotos.review(adm, PH.m.pb, 'reject', 'yüz görünmüyor'), { ok: true, moderation: 'rejected' });
    assert.equal(store.files.has(key), false);
    assert.equal((await q(`SELECT moderation FROM user_photos WHERE id=$1`, [PH.m.pb]))[0].moderation, 'rejected');
    assert.equal(await code(adminPhotos.review(adm, PH.m.pb, 'approve')), 'PHOTO_CLOSED');
    assert.equal(await code(adminPhotos.review(adm, PH.m.pb, 'reject', 'tekrar')), 'PHOTO_CLOSED');
    const keyA = (await q(`SELECT storage_key FROM user_photos WHERE id=$1`, [PH.m.pa]))[0].storage_key;
    await adminPhotos.review(adm, PH.m.pa, 'reject', 'sonradan uygunsuz bulundu');
    assert.equal(store.files.has(keyA), false);
    assert.equal(await code(photos.file(PH.m.b, keyA)), 'PHOTO_NOT_FOUND');
    assert.equal(await code(adminPhotos.review(adm, randomUUID(), 'approve')), 'PHOTO_NOT_FOUND');
    assert.equal(await count(`SELECT count(*)::int AS n FROM moderation_actions WHERE admin_id=$1 AND action='photo_reject'`, [mod.id]), 2);
  });
  await t('hesap silme: fotoğraf satırları ve dosyaları gider; başkasının dosyasına dokunulmaz', async () => {
    const a = await quickUser('Sil1'), b = await quickUser('Sil2');
    const pa: any = await photos.upload(a, makeJpeg(300, 300), 'image/jpeg');
    const pb: any = await photos.upload(b, makeJpeg(300, 300), 'image/jpeg');
    const ka = (await q(`SELECT storage_key FROM user_photos WHERE id=$1`, [pa.photo.id]))[0].storage_key;
    const kb = (await q(`SELECT storage_key FROM user_photos WHERE id=$1`, [pb.photo.id]))[0].storage_key;
    await me.deleteMe(a);
    assert.equal(store.files.has(ka), false);
    assert.equal(store.files.has(kb), true);
    assert.equal(await count(`SELECT count(*)::int AS n FROM user_photos WHERE user_id=$1`, [a]), 0);
    assert.equal(await count(`SELECT count(*)::int AS n FROM user_photos WHERE user_id=$1`, [b]), 1);
  });
  await t('depo silme hatası hesap silmeyi bozmaz', async () => {
    const a = await quickUser('Sil3');
    await photos.upload(a, makeJpeg(300, 300), 'image/jpeg');
    const failing = { put: store.put.bind(store), get: store.get.bind(store), delete: async () => { throw new Error('depo kapalı'); } };
    await new MeService(db, tokens, failing as any).deleteMe(a);
    assert.equal((await q(`SELECT status FROM users WHERE id=$1`, [a]))[0].status, 'deleted');
  });


  sec('7i. Kafe paneli');
  const CP: any = {};
  await t('hazırlık: kafe, sahip ve personel hesapları; giriş; yanlış/devre dışı hesap aynı hata', async () => {
    CP.cafe = await mkCafe('Panel Kafe');
    const other = await mkCafe('Panel Diğer');
    const h = await hashPassword('Kafe-Parola-12345');
    const ins = async (cafeId: string, email: string, role: string, status = 'active') =>
      (await q(`INSERT INTO cafe_accounts (cafe_id,email,password_hash,role,status) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [cafeId, email, h, role, status]))[0].id;
    CP.owner = await ins(CP.cafe.id, 'sahip@panel.com', 'owner'); CP.staff = await ins(CP.cafe.id, 'personel@panel.com', 'staff');
    CP.off = await ins(CP.cafe.id, 'kapali@panel.com', 'staff', 'disabled'); CP.otherOwner = await ins(other.id, 'baska@panel.com', 'owner');
    CP.other = other;
    const r: any = await cafeAuth.login(' SAHIP@panel.com ', 'Kafe-Parola-12345', '5.5.5.1');
    CP.ownerTok = r.access_token; CP.staffTok = (await cafeAuth.login('personel@panel.com', 'Kafe-Parola-12345', '5.5.5.1') as any).access_token;
    CP.otherTok = (await cafeAuth.login('baska@panel.com', 'Kafe-Parola-12345', '5.5.5.1') as any).access_token;
    assert.equal(r.account.role, 'owner');
    for (const [e, pw] of [['sahip@panel.com', 'yanlis'], ['yok@panel.com', 'Kafe-Parola-12345'], ['kapali@panel.com', 'Kafe-Parola-12345']]) {
      assert.equal(await code(cafeAuth.login(e, pw, '5.5.5.2')), 'INVALID_CREDENTIALS');
    }
    for (let i = 0; i < 5; i++) await code(cafeAuth.login('personel@panel.com', 'x', '5.5.5.3'));
    assert.equal(await code(cafeAuth.login('personel@panel.com', 'Kafe-Parola-12345', '5.5.5.3')), 'TOO_MANY_REQUESTS');
  });
  const asCafe = async (tok: string) => { const r = reqWith('Bearer ' + tok); await cafeGuard.canActivate(r.ctx); return r.req.cafe; };
  await t('guard: yalnızca kafe token\'ı; kullanıcı/admin token\'ı girmez; kafe token\'ı diğer uçlara girmez; askıdaki kafe ve kapatılan hesap düşer', async () => {
    assert.equal((await asCafe(CP.ownerTok)).cafeId, CP.cafe.id);
    const userTok = await jwt.signAsync({ sub: U.A.id, role: 'user', typ: 'access' }, { expiresIn: 60 });
    assert.equal(await code(cafeGuard.canActivate(reqWith('Bearer ' + userTok).ctx)), 'UNAUTHORIZED');
    assert.equal(await code(cafeGuard.canActivate(reqWith('Bearer ' + AD.token).ctx)), 'UNAUTHORIZED');
    assert.equal(await code(guard.canActivate(reqWith('Bearer ' + CP.ownerTok).ctx)), 'UNAUTHORIZED');
    assert.equal(await code(adminGuard.canActivate(reqWith('Bearer ' + CP.ownerTok).ctx)), 'UNAUTHORIZED');
    assert.equal(await code(cafeGuard.canActivate(reqWith().ctx)), 'UNAUTHORIZED');
    await q(`UPDATE cafes SET status='suspended' WHERE id=$1`, [CP.cafe.id]);
    assert.equal(await code(cafeGuard.canActivate(reqWith('Bearer ' + CP.ownerTok).ctx)), 'CAFE_SUSPENDED');
    assert.equal(await code(cafeAuth.login('sahip@panel.com', 'Kafe-Parola-12345', '5.5.5.4')), 'INVALID_CREDENTIALS');
    await q(`UPDATE cafes SET status='active' WHERE id=$1`, [CP.cafe.id]);
    await q(`UPDATE cafe_accounts SET status='disabled' WHERE id=$1`, [CP.staff]);
    assert.equal(await code(cafeGuard.canActivate(reqWith('Bearer ' + CP.staffTok).ctx)), 'UNAUTHORIZED');
    await q(`UPDATE cafe_accounts SET status='active' WHERE id=$1`, [CP.staff]);
  });
  await t('profil: sahip günceller (kısmi), personel güncelleyemez; doğrulama hataları; QR sırrı hiçbir yanıtta yok', async () => {
    const owner = await asCafe(CP.ownerTok), staff = await asCafe(CP.staffTok);
    const me: any = await cafePanel.me(owner);
    assert.equal(me.cafe.name, 'Panel Kafe'); assert.equal('qr_secret' in me.cafe, false);
    const r: any = await cafePanel.updateProfile(owner, { description: '  Sessiz bir köşe  ', opening_hours: { mon: [['09:00', '23:00']] }, lat: 41.01, lng: 28.97 });
    assert.equal(r.cafe.description, 'Sessiz bir köşe'); assert.equal(r.cafe.name, 'Panel Kafe');
    assert.deepEqual(r.cafe.opening_hours, { mon: [['09:00', '23:00']] });
    assert.equal(JSON.stringify(r).includes('qr_secret'), false);
    assert.equal(await code(cafePanel.updateProfile(staff, { description: 'x' })), 'FORBIDDEN');
    assert.equal(await code(cafePanel.updateProfile(owner, { name: 'a' })), 'INVALID_CAFE_DATA');
    assert.equal(await code(cafePanel.updateProfile(owner, { lat: 95 })), 'INVALID_CAFE_DATA');
    assert.equal(await code(cafePanel.updateProfile(owner, { lat: null })), 'INVALID_CAFE_DATA');   // lat/lng birlikte
    assert.equal(await code(cafePanel.updateProfile(owner, { opening_hours: { zzz: [] } })), 'INVALID_CAFE_DATA');
    assert.equal((await q(`SELECT description FROM cafes WHERE id=$1`, [CP.cafe.id]))[0].description, 'Sessiz bir köşe');   // hatalı istek veriyi bozmadı
    const o2 = await asCafe(CP.otherTok);
    assert.equal(((await cafePanel.me(o2)) as any).cafe.name, 'Panel Diğer');                      // başka kafeye karışmaz
  });
  await t('QR: gerçek check-in\'de çalışır; pencere sonunda yenilenir; onaysız/askıdaki kafede verilmez', async () => {
    const owner = await asCafe(CP.ownerTok), staff = await asCafe(CP.staffTok);
    const a: any = await cafePanel.qr(staff);
    assert.ok(a.expires_in > 0 && a.expires_in <= a.window_seconds);
    assert.equal(a.link, `kafeapp://checkin?c=${CP.cafe.id}&t=${a.token}`);
    await q(`UPDATE cafes SET opening_hours='{}' WHERE id=$1`, [CP.cafe.id]);   // önceki adım saatleri kısıtladı
    const u = await register('0536 777 88 99', 'Panelci');
    const scan: any = await checkins.scan(u.id, CP.cafe.id, a.token);
    assert.ok(scan);
    assert.equal((await q(`SELECT count(*)::int AS n FROM checkins WHERE user_id=$1 AND ended_at IS NULL`, [u.id]))[0].n, 1);
    await q(`UPDATE cafes SET status='pending' WHERE id=$1`, [CP.cafe.id]);
    assert.equal(await code(cafePanel.qr(owner)), 'CAFE_NOT_ACTIVE');
    await q(`UPDATE cafes SET status='active' WHERE id=$1`, [CP.cafe.id]);
  });
  await t('buluşma noktaları: sahip ekler/kapatır/açar; tekrar ve 10 sınırı; personel yalnızca okur; başka kafenin noktasına dokunulmaz; davet akışında kullanılır', async () => {
    await q(`DELETE FROM cafe_meeting_points WHERE cafe_id=$1`, [CP.cafe.id]);
    const owner = await asCafe(CP.ownerTok), staff = await asCafe(CP.staffTok), o2 = await asCafe(CP.otherTok);
    const p1: any = await cafePanel.addPoint(owner, ' Kasanın  yanı ');
    assert.equal(p1.meeting_point.label, 'Kasanın yanı');
    await cafePanel.addPoint(owner, 'Teras Bahçe');
    assert.equal(await code(cafePanel.addPoint(owner, 'TERAS bahçe')), 'POINT_EXISTS');   // büyük/küçük harf farkı tekrar sayılır (ASCII)
    assert.equal(await code(cafePanel.addPoint(staff, 'Teras')), 'FORBIDDEN');
    assert.equal(await code(cafePanel.addPoint(owner, 'x')), 'INVALID_CAFE_DATA');
    for (let i = 3; i <= 10; i++) await cafePanel.addPoint(owner, `Masa ${i}`);
    assert.equal(await code(cafePanel.addPoint(owner, 'Masa 11')), 'POINT_LIMIT');
    await cafePanel.updatePoint(owner, p1.meeting_point.id, { is_active: false });
    await cafePanel.addPoint(owner, 'Masa 11');                                                   // yer açıldı
    assert.equal(await code(cafePanel.updatePoint(owner, p1.meeting_point.id, { is_active: true })), 'POINT_LIMIT');
    assert.equal(await code(cafePanel.updatePoint(o2, p1.meeting_point.id, { label: 'Hack' })), 'POINT_NOT_FOUND');
    assert.equal(((await cafePanel.points(staff)) as any).meeting_points.length, 11);
    const ren: any = await cafePanel.updatePoint(owner, (await q(`SELECT id FROM cafe_meeting_points WHERE label='Masa 3' AND cafe_id=$1`, [CP.cafe.id]))[0].id, { label: 'Teras' });
    assert.equal(ren.meeting_point.label, 'Teras');
    // kafenin eklediği nokta kullanıcı davet akışında görünür
    const x = await quickUser('PNokta1'), y = await quickUser('PNokta2');
    await quickCheckin(x, CP.cafe.id, false); await quickCheckin(y, CP.cafe.id, false);
    const mid = (await q(`INSERT INTO matches (user_a_id,user_b_id,cafe_id) VALUES (LEAST($1::uuid,$2::uuid),GREATEST($1::uuid,$2::uuid),$3) RETURNING id`, [x, y, CP.cafe.id]))[0].id;
    const labels = ((await invitations.meetingPoints(x)) as any).meeting_points;
    assert.ok(labels.some((m: any) => m.label === 'Teras') && !labels.some((m: any) => m.label === 'Kasanın yanı'));
    assert.ok(await invitations.create(x, mid, labels[0].id));
  });
  await t('Rahatsızım uyarısı: kafe yalnızca bildirimi istenenleri görür, kimlik yok; onaylayınca düşer; başka kafe göremez/onaylayamaz', async () => {
    await q(`DELETE FROM safety_alerts`);
    const owner = await asCafe(CP.ownerTok), o2 = await asCafe(CP.otherTok);
    const p = await mkPair('Pn1', 'Pn2');
    await q(`UPDATE cafes SET name='Mesaj Kafe' WHERE false`);
    // mkPair 'Mesaj Kafe' kullanır; uyarıyı panel kafesinde üretmek için check-in'leri taşı
    await q(`UPDATE checkins SET cafe_id=$1 WHERE id = ANY($2::uuid[])`, [CP.cafe.id, [p.cx, p.cy]]);
    const pt = await q(`SELECT id FROM cafe_meeting_points WHERE cafe_id=$1 AND is_active LIMIT 1`, [CP.cafe.id]);
    const inv = (await q(`INSERT INTO invitations (match_id,from_user_id,to_user_id,cafe_id,meeting_point_id) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [p.mid, p.y, p.x, CP.cafe.id, pt[0].id]))[0].id;
    await safety.alert(p.x, { invitation_id: inv, notify_cafe: true });
    const p2 = await mkPair('Pn3', 'Pn4'); await q(`UPDATE checkins SET cafe_id=$1 WHERE id=$2`, [CP.cafe.id, p2.cx]);
    await safety.alert(p2.x, { other_user_id: p2.y, notify_cafe: false });
    const l: any = await cafePanel.alerts(owner);
    assert.equal(l.alerts.length, 1);
    assert.ok(l.alerts[0].meeting_point);
    assert.equal(/user|other|name|phone|email/i.test(JSON.stringify(l)), false);
    assert.equal(((await cafePanel.alerts(o2)) as any).alerts.length, 0);
    assert.equal(await code(cafePanel.ackAlert(o2, l.alerts[0].id)), 'ALERT_NOT_FOUND');
    assert.deepEqual(await cafePanel.ackAlert(owner, l.alerts[0].id), { ok: true });
    assert.equal(await code(cafePanel.ackAlert(owner, l.alerts[0].id)), 'ALERT_NOT_FOUND');
    assert.ok(((await cafePanel.alerts(owner)) as any).alerts[0].cafe_ack_at);
    assert.equal((await q(`SELECT handled_at FROM safety_alerts WHERE id=$1`, [l.alerts[0].id]))[0].handled_at, null);   // yönetici kuyruğu ayrı
  });


  sec('7j. Etkinlikler');
  const EV: any = {};
  const inDays = (d: number, hours = 0) => new Date(Date.now() + d * 86400_000 + hours * 3600_000).toISOString();
  const evBody = (over: any = {}) => ({ title: 'Quiz Gecesi', category: 'quiz', starts_at: inDays(2), ends_at: inDays(2, 2), capacity: 2, ...over });
  await t('etkinlik oluşturma: sahip oluşturur; personel, onaysız kafe ve geçersiz alanlar reddedilir', async () => {
    EV.owner = await asCafe(CP.ownerTok); EV.staff = await asCafe(CP.staffTok); EV.o2 = await asCafe(CP.otherTok);
    const r: any = await cafeEvents.create(EV.owner, evBody());
    EV.id = r.event.id;
    assert.equal(r.event.status, 'scheduled');
    assert.equal(await code(cafeEvents.create(EV.staff, evBody())), 'FORBIDDEN');
    assert.equal(await code(cafeEvents.create({ ...EV.owner, cafeStatus: 'pending' }, evBody())), 'CAFE_NOT_ACTIVE');
    for (const bad of [{ starts_at: inDays(-1), ends_at: inDays(-1, 2) }, { ends_at: inDays(2, -1) }, { ends_at: inDays(2, 13) }, { category: 'dans' }, { capacity: 0 }, { title: 'ab' }, { starts_at: inDays(200), ends_at: inDays(200, 1) }]) {
      assert.ok(['INVALID_EVENT', 'INVALID_CAFE_DATA'].includes((await code(cafeEvents.create(EV.owner, evBody(bad)))) ?? ''), JSON.stringify(bad));
    }
    assert.equal(((await cafeEvents.list(EV.owner)) as any).events.length, 1);
    assert.equal(((await cafeEvents.list(EV.o2)) as any).events.length, 0);
  });
  await t('katılım: tekrar katılım zararsız; kapasite dolunca EVENT_FULL; dolu etkinlikte mevcut katılımcı tekrar katılabilir; ayrılınca yer açılır', async () => {
    EV.u = [await quickUser('Ev1'), await quickUser('Ev2'), await quickUser('Ev3')];
    assert.deepEqual(await eventsSvc.join(EV.u[0], EV.id), { ok: true });
    await eventsSvc.join(EV.u[0], EV.id);
    assert.equal(await count(`SELECT count(*)::int AS n FROM event_attendees WHERE event_id=$1`, [EV.id]), 1);
    await eventsSvc.join(EV.u[1], EV.id);
    assert.equal(await code(eventsSvc.join(EV.u[2], EV.id)), 'EVENT_FULL');
    assert.equal(await code(eventsSvc.join(EV.u[0], EV.id)), null);
    const l: any = await cafes.events(CP.cafe.id, EV.u[0]);
    assert.equal(l.events[0].is_full, true); assert.equal(l.events[0].joined, true);
    assert.equal(JSON.stringify(l).includes('attendee'), false);                                   // sayı/liste kullanıcıya dönmez
    assert.equal(((await cafes.events(CP.cafe.id, EV.u[2])) as any).events[0].joined, false);
    assert.equal(((await eventsSvc.mine(EV.u[0])) as any).events.length, 1);
    await eventsSvc.leave(EV.u[1], EV.id);
    assert.equal(await code(eventsSvc.join(EV.u[2], EV.id)), null);
    assert.equal(await code(eventsSvc.join(EV.u[2], randomUUID())), 'EVENT_NOT_FOUND');
  });
  await t('eşzamanlı katılım: kapasite 3, 8 kişi aynı anda → tam 3 kayıt', async () => {
    const ev: any = await cafeEvents.create(EV.owner, evBody({ title: 'Yarış Etkinliği', capacity: 3 }));
    const us = await Promise.all(Array.from({ length: 8 }, (_, i) => quickUser('Yaris' + i)));
    const res = await Promise.all(us.map((u) => code(eventsSvc.join(u, ev.event.id))));
    assert.equal(res.filter((r) => r === null).length, 3);
    assert.equal(res.filter((r) => r === 'EVENT_FULL').length, 5);
    assert.equal(await count(`SELECT count(*)::int AS n FROM event_attendees WHERE event_id=$1`, [ev.event.id]), 3);
  });
  await t('düzenleme: sahip günceller; kapasite katılımcı sayısının altına inemez; başka kafe dokunamaz; geçmiş etkinlik düzenlenemez', async () => {
    const r: any = await cafeEvents.update(EV.owner, EV.id, { title: 'Büyük Quiz', capacity: 5 });
    assert.equal(r.event.title, 'Büyük Quiz'); assert.equal(r.event.capacity, 5); assert.equal(r.event.category, 'quiz');
    await eventsSvc.join(EV.u[1], EV.id);
    assert.equal(await code(cafeEvents.update(EV.owner, EV.id, { capacity: 1 })), 'CAPACITY_BELOW_ATTENDEES');
    assert.equal(await code(cafeEvents.update(EV.owner, EV.id, { ends_at: inDays(1) })), 'INVALID_EVENT');       // bitiş başlangıçtan önce
    assert.equal(await code(cafeEvents.update(EV.staff, EV.id, { title: 'Hack!!' })), 'FORBIDDEN');
    assert.equal(await code(cafeEvents.update(EV.o2, EV.id, { title: 'Hack!!' })), 'EVENT_NOT_FOUND');
    const past = (await q(`INSERT INTO events (cafe_id,title,starts_at,ends_at) VALUES ($1,'Geçmiş',now() - interval '3 hours', now() - interval '1 hour') RETURNING id`, [CP.cafe.id]))[0].id;
    assert.equal(await code(cafeEvents.update(EV.owner, past, { title: 'Yeni ad' })), 'EVENT_CLOSED');
    assert.equal(await code(eventsSvc.join(EV.u[2], past)), 'EVENT_CLOSED');
  });
  await t('iptal: katılım kapanır, kullanıcı listesinden düşer; ikinci iptal 409; başka kafe iptal edemez', async () => {
    assert.equal(await code(cafeEvents.cancel(EV.o2, EV.id)), 'EVENT_NOT_FOUND');
    assert.equal(await code(cafeEvents.cancel(EV.staff, EV.id)), 'FORBIDDEN');
    assert.deepEqual(await cafeEvents.cancel(EV.owner, EV.id), { ok: true });
    assert.equal(await code(cafeEvents.cancel(EV.owner, EV.id)), 'EVENT_CLOSED');
    assert.equal(await code(eventsSvc.join(EV.u[2], EV.id)), 'EVENT_CLOSED');
    assert.equal(((await eventsSvc.mine(EV.u[0])) as any).events.length, 0);
    assert.equal(((await cafes.events(CP.cafe.id, EV.u[0])) as any).events.some((e: any) => e.id === EV.id), false);
  });
  await t('hesap silme: etkinlik katılımları da silinir', async () => {
    const ev: any = await cafeEvents.create(EV.owner, evBody({ title: 'Silme Testi', capacity: null }));
    const u = await quickUser('EvSil'); await eventsSvc.join(u, ev.event.id);
    await me.deleteMe(u);
    assert.equal(await count(`SELECT count(*)::int AS n FROM event_attendees WHERE user_id=$1`, [u]), 0);
  });

  sec('7k. Kafe istatistiği (k ≥ 5)');
  await t('kovalar: 5\'ten küçük saat/gün/niyet hiç görünmez; toplam 5\'in katına iner; kimlik yok', async () => {
    const sc = await mkCafe('Stat Kafe');
    const ownerH = await hashPassword('Kafe-Parola-12345');
    const acc = (await q(`INSERT INTO cafe_accounts (cafe_id,email,password_hash,role) VALUES ($1,'stat@panel.com',$2,'owner') RETURNING id`, [sc.id, ownerH]))[0].id;
    const cu = { accountId: acc, cafeId: sc.id, role: 'owner', cafeStatus: 'active' };
    const mk = async (ago: string, intent: string | null) => {
      const u = await quickUser('St');
      const id = (await q(`INSERT INTO checkins (user_id,cafe_id,visible,started_at,expires_at,ended_at) VALUES ($1,$2,false, now() - $3::interval, now() - $3::interval + interval '2 hours', now() - $3::interval + interval '1 hour') RETURNING id`, [u, sc.id, ago]))[0].id;
      if (intent) await q(`INSERT INTO checkin_intents (checkin_id,intent_id) SELECT $1, id FROM intents WHERE slug=$2`, [id, intent]);
    };
    for (let i = 0; i < 4; i++) await mk('1 day', null);
    const small: any = await cafeStats.stats(cu);
    assert.equal(small.total_checkins_at_least, null); assert.deepEqual(small.by_hour, []); assert.deepEqual(small.by_weekday, []); assert.deepEqual(small.intents, []);
    for (let i = 0; i < 3; i++) await mk('1 day', 'coffee');      // dün: 7 check-in, 3'ü coffee
    for (let i = 0; i < 3; i++) await mk('2 days 5 hours', 'coffee');   // başka saat/gün: 3 check-in
    for (let i = 0; i < 2; i++) await mk('3 days 9 hours', 'meet'); // niyet 'meet' yalnızca 2
    const s: any = await cafeStats.stats(cu, 7);
    assert.equal(s.min_group_size, 5);
    assert.equal(s.total_checkins_at_least, 10);                    // 4+3+3+2 = 12 → 10
    assert.equal(s.by_hour.length, 1); assert.equal(s.by_hour[0].count, 7);
    assert.equal(s.by_weekday.length, 1); assert.equal(s.by_weekday[0].count, 7);
    assert.deepEqual(s.intents.map((x: any) => [x.slug, x.count]), [['coffee', 6]]);   // 'meet' (2) gizli
    assert.equal(/user|name|email|phone/i.test(JSON.stringify({ ...s, events: [] })), false);
    assert.equal(((await cafeStats.stats(cu, 1)) as any).period_days, 1);
    assert.equal(((await cafeStats.stats(cu, 500)) as any).period_days, 90);                   // üst sınır
    assert.equal(((await cafeStats.stats(cu, 0)) as any).period_days, 1);
    // başka kafenin verisi karışmaz
    const empty = await mkCafe('Boş Stat Kafe');
    const other: any = await cafeStats.stats({ ...cu, cafeId: empty.id }, 7);
    assert.equal(other.total_checkins_at_least, null); assert.equal(other.by_hour.length, 0);
  });

  sec('7l. Kafe kaydı ve yönetici onayı');
  await t('kayıt: kafe pending doğar, sahip girer ama QR/etkinlik/liste yok; aynı e-posta, zayıf parola ve hız sınırı', async () => {
    assert.deepEqual(await cafeRegister.register({ name: 'Yeni Kafe', address: 'Moda Cad. 12', city: 'İstanbul', district: 'Kadıköy', email: 'Yeni@Kafe.com', password: 'Cok-Guclu-Parola-9' }, '4.4.4.1'), { ok: true, status: 'pending' });
    const c = (await q(`SELECT id, status, octet_length(qr_secret) AS n FROM cafes WHERE name='Yeni Kafe'`))[0];
    assert.equal(c.status, 'pending'); assert.equal(c.n, 32);
    EV.newCafe = c.id;
    const tok = ((await cafeAuth.login('yeni@kafe.com', 'Cok-Guclu-Parola-9', '4.4.4.2')) as any).access_token;
    const cu = await asCafe(tok);
    assert.equal(cu.cafeStatus, 'pending'); assert.equal(cu.role, 'owner');
    assert.equal(await code(cafePanel.qr(cu)), 'CAFE_NOT_ACTIVE');
    assert.equal(await code(cafeEvents.create(cu, evBody())), 'CAFE_NOT_ACTIVE');
    assert.equal(((await cafes.list({ q: 'Yeni Kafe' })) as any).cafes.length, 0);
    assert.equal(await code(cafeRegister.register({ name: 'Başka', address: 'Adres 123', city: 'İstanbul', email: 'yeni@kafe.com', password: 'Cok-Guclu-Parola-9' }, '4.4.4.3')), 'EMAIL_TAKEN');
    assert.equal(await count(`SELECT count(*)::int AS n FROM cafes WHERE name='Başka'`), 0);        // yarım kayıt kalmaz
    assert.equal(await code(cafeRegister.register({ name: 'Zayıf', address: 'Adres 123', city: 'İstanbul', email: 'z@kafe.com', password: 'kisa' }, '4.4.4.4')), 'WEAK_PASSWORD');
    assert.equal(await code(cafeRegister.register({ name: 'Zayıf', address: 'Adres 123', city: 'İstanbul', email: 'zeynep@kafe.com', password: 'zeynep-parola-1234' }, '4.4.4.4')), 'WEAK_PASSWORD');
    assert.equal(await code(cafeRegister.register({ name: 'X', address: 'Adres 123', city: 'İstanbul', email: 'x@kafe.com', password: 'Cok-Guclu-Parola-9' }, '4.4.4.5')), 'INVALID_CAFE_DATA');
    const k = new MemoryKvStore(); const svc = new CafeRegisterService(db, k); let last = '';
    for (let i = 0; i < 4; i++) last = (await code(svc.register({ name: 'Hız Kafe', address: 'Adres 123', city: 'İstanbul', email: `h${i}@kafe.com`, password: 'Cok-Guclu-Parola-9' }, '4.4.4.6'))) ?? 'ok';
    assert.equal(last, 'TOO_MANY_REQUESTS');
  });
  await t('yönetici onayı: kuyruk sahip e-postasını gösterir; moderatör onaylayamaz; onaylayınca QR ve liste açılır', async () => {
    const adm = { id: boss.id, role: 'admin' as const }, md = { id: mod.id, role: 'moderator' as const };
    const q1: any = await adminCafes.queue();
    const row = q1.cafes.find((c: any) => c.id === EV.newCafe);
    assert.deepEqual(row.owner_emails, ['yeni@kafe.com']);
    assert.equal(await code(adminCafes.setStatus(md, EV.newCafe, 'active')), 'FORBIDDEN');
    assert.deepEqual(await adminCafes.setStatus(adm, EV.newCafe, 'active'), { ok: true, status: 'active' });
    assert.equal(await code(adminCafes.setStatus(adm, EV.newCafe, 'active')), 'CAFE_UNCHANGED');
    assert.equal(await code(adminCafes.setStatus(adm, randomUUID(), 'active')), 'CAFE_NOT_FOUND');
    const tok = ((await cafeAuth.login('yeni@kafe.com', 'Cok-Guclu-Parola-9', '4.4.4.7')) as any).access_token;
    assert.ok(((await cafePanel.qr(await asCafe(tok))) as any).token);
    assert.equal(((await cafes.list({ q: 'Yeni Kafe' })) as any).cafes.length, 1);
    assert.equal(await count(`SELECT count(*)::int AS n FROM moderation_actions WHERE admin_id=$1 AND action='cafe_activate'`, [boss.id]), 1);
  });
  await t('askıya alma: gerekçe şart; açık check-in\'ler kapanır, davetler iptal olur, QR/giriş durur, listeden düşer', async () => {
    const adm = { id: boss.id, role: 'admin' as const };
    const x = await quickUser('Ask1'), y = await quickUser('Ask2');
    const cx = await quickCheckin(x, EV.newCafe, false); await quickCheckin(y, EV.newCafe, false);
    const mid = (await q(`INSERT INTO matches (user_a_id,user_b_id,cafe_id) VALUES (LEAST($1::uuid,$2::uuid),GREATEST($1::uuid,$2::uuid),$3) RETURNING id`, [x, y, EV.newCafe]))[0].id;
    const pt = (await q(`INSERT INTO cafe_meeting_points (cafe_id,label) VALUES ($1,'Kapı') RETURNING id`, [EV.newCafe]))[0].id;
    const inv = ((await invitations.create(x, mid, pt)) as any).invitation.id;
    assert.equal(await code(adminCafes.setStatus(adm, EV.newCafe, 'suspended')), 'NOTE_REQUIRED');
    await adminCafes.setStatus(adm, EV.newCafe, 'suspended', 'sahte işletme');
    assert.equal((await q(`SELECT ended_at IS NOT NULL AS e FROM checkins WHERE id=$1`, [cx]))[0].e, true);
    assert.equal((await q(`SELECT status FROM invitations WHERE id=$1`, [inv]))[0].status, 'cancelled');
    assert.equal(await code(cafeAuth.login('yeni@kafe.com', 'Cok-Guclu-Parola-9', '4.4.4.8')), 'INVALID_CREDENTIALS');
    assert.equal(((await cafes.list({ q: 'Yeni Kafe' })) as any).cafes.length, 0);
    assert.equal(await count(`SELECT count(*)::int AS n FROM moderation_actions WHERE action='cafe_suspend' AND note LIKE '%sahte işletme%'`), 1);
  });

  sec('8. Hesap silme (KVKK)');
  await t('B hesabını siler: kişisel veri temizlenir, ilişkili kayıtlar silinir/kapanır, oturumlar biter', async () => {
    const m1 = (await q(`INSERT INTO messages (match_id, sender_id, body) VALUES ($1,$2,'merhaba') RETURNING id`, [matchAB, U.A.id]))[0].id;
    const m2 = (await q(`INSERT INTO messages (match_id, sender_id, body) VALUES ($1,$2,'şikayete konu') RETURNING id`, [matchAB, U.B.id]))[0].id;
    await q(`INSERT INTO reports (reporter_id, reported_id, context, message_id, reason, status) VALUES ($1,$2,'chat',$3,'taciz','open')`, [U.A.id, U.B.id, m2]);
    assert.ok((await ids(U.A.id)).every((i: string) => i !== U.B.id));

    await me.deleteMe(U.B.id);

    const u = (await q(`SELECT status, display_name, bio, email, phone_hash, phone_enc, deleted_at FROM users WHERE id=$1`, [U.B.id]))[0];
    assert.equal(u.status, 'deleted');
    assert.equal(u.display_name, 'Silinmiş kullanıcı');
    assert.ok(u.bio === null && u.email === null && u.phone_hash === null && u.phone_enc === null && u.deleted_at);
    assert.equal(await count(`SELECT count(*)::int AS n FROM likes WHERE from_user_id=$1 OR to_user_id=$1`, [U.B.id]), 0);
    assert.equal(await count(`SELECT count(*)::int AS n FROM user_interests WHERE user_id=$1`, [U.B.id]), 0);
    assert.equal(await count(`SELECT count(*)::int AS n FROM checkins WHERE user_id=$1 AND ended_at IS NULL`, [U.B.id]), 0);
    assert.equal((await q(`SELECT status FROM matches WHERE id=$1`, [matchAB]))[0].status, 'ended');
    assert.equal(await count(`SELECT count(*)::int AS n FROM messages WHERE id=$1`, [m1]), 0);
    assert.equal(await count(`SELECT count(*)::int AS n FROM messages WHERE id=$1`, [m2]), 1); // açık şikâyete konu: korunur
    assert.equal(await code(auth.refresh(U.B.refresh_token)), 'TOKEN_INVALID');
    assert.equal(await code(guard.canActivate(reqWith('Bearer ' + U.B.access_token).ctx)), 'ACCOUNT_DISABLED');
    assert.ok(!(await ids(U.A.id)).includes(U.B.id));
  });
  await t('silinen kişinin numarasıyla yeniden kayıt olunabilir (yeni, temiz hesap)', async () => {
    const raw = '0533 222 33 44';
    await clearCooldown(raw);
    const again = await register(raw, 'Mehmet');
    assert.notEqual(again.id, U.B.id);
    assert.equal(await count(`SELECT count(*)::int AS n FROM users WHERE status='active' AND phone_hash IS NOT NULL AND display_name='Mehmet'`), 1);
  });

  sec('9. Saklama süreleri (bakım işi)');
  await t('30 günden eski deneme kayıtları ve beğeniler silinir; 90 günden eski check-in\'lerde kullanıcı bağı kalkar', async () => {
    const u = await quickUser('Retention');
    const w = await quickUser('Retention2');
    await q(`INSERT INTO checkin_attempts (user_id, cafe_id, success, reason, created_at) VALUES ($1,$2,false,'eski', now() - interval '31 days')`, [u, cafe1.id]);
    await q(`INSERT INTO checkin_attempts (user_id, cafe_id, success, reason) VALUES ($1,$2,false,'yeni')`, [u, cafe1.id]);
    const ck = (await q(
      `INSERT INTO checkins (user_id, cafe_id, visible, started_at, expires_at, ended_at)
       VALUES ($1,$2,false, now() - interval '92 days', now() - interval '92 days' + interval '2 hours', now() - interval '91 days') RETURNING id`,
      [u, cafe1.id],
    ))[0].id;
    await q(`INSERT INTO likes (from_user_id,to_user_id,cafe_id,checkin_id,kind,created_at) VALUES ($1,$2,$3,$4,'like', now() - interval '40 days')`, [u, w, cafe1.id, ck]);
    await new CheckinsMaintenanceService(db).tick();
    assert.equal(await count(`SELECT count(*)::int AS n FROM checkin_attempts WHERE user_id=$1 AND reason='eski'`, [u]), 0);
    assert.equal(await count(`SELECT count(*)::int AS n FROM checkin_attempts WHERE user_id=$1 AND reason='yeni'`, [u]), 1);
    assert.equal((await q(`SELECT user_id FROM checkins WHERE id=$1`, [ck]))[0].user_id, null);
    assert.equal(await count(`SELECT count(*)::int AS n FROM likes WHERE checkin_id=$1`, [ck]), 0);
  });

  console.log(`\n==== SONUÇ: ${pass} geçti, ${fail} kaldı ====`);
  if (fail) console.log('Kalanlar:\n - ' + failures.join('\n - '));
  await db.onModuleDestroy();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('BEKLENMEYEN HATA', e);
  process.exit(2);
});
