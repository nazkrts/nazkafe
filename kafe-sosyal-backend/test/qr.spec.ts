import assert from 'node:assert/strict';
import { qrTokenFor, qrWindowOf, verifyQrToken } from '../src/common/qr';

const secret = Buffer.from('s'.repeat(32));
const cafe = '11111111-1111-1111-1111-111111111111';
const otherCafe = '22222222-2222-2222-2222-222222222222';
const W = 300;
const now = 1_800_000_000_000;
const cur = qrWindowOf(now, W);
const tok = (w: number, c = cafe, s: Buffer = secret) => qrTokenFor(s, c, w);

describe('dönen QR doğrulaması', () => {
  it('şu anki pencerenin token\'ı kabul edilir', () => {
    assert.equal(verifyQrToken(secret, cafe, tok(cur), now, W), 'ok');
  });

  it('bir önceki pencere (tarama süresi / saat farkı payı) kabul edilir', () => {
    assert.equal(verifyQrToken(secret, cafe, tok(cur - 1), now, W), 'ok');
  });

  it('daha eski ama gerçekten bu kafenin token\'ı "expired" olur', () => {
    assert.equal(verifyQrToken(secret, cafe, tok(cur - 2), now, W), 'expired');
    assert.equal(verifyQrToken(secret, cafe, tok(cur - 8), now, W), 'expired');
  });

  it('çok eski token artık tanınmaz: invalid', () => {
    assert.equal(verifyQrToken(secret, cafe, tok(cur - 30), now, W), 'invalid');
  });

  it('gelecek pencere kabul edilmez', () => {
    assert.equal(verifyQrToken(secret, cafe, tok(cur + 1), now, W), 'invalid');
  });

  it('başka kafenin token\'ı veya başka sır geçersizdir', () => {
    assert.equal(verifyQrToken(secret, cafe, tok(cur, otherCafe), now, W), 'invalid');
    assert.equal(verifyQrToken(secret, cafe, tok(cur, cafe, Buffer.from('x'.repeat(32))), now, W), 'invalid');
  });

  it('anlamsız girdi geçersizdir', () => {
    for (const bad of ['', 'x', 'a'.repeat(22), 'a'.repeat(500)]) {
      assert.equal(verifyQrToken(secret, cafe, bad, now, W), 'invalid');
    }
  });

  it('token 22 karakter ve URL-güvenli', () => {
    assert.match(tok(cur), /^[A-Za-z0-9_-]{22}$/);
  });

  it('pencere sınırında token değişir', () => {
    assert.notEqual(tok(cur), tok(cur + 1));
    assert.equal(qrWindowOf(now + W * 1000, W), cur + 1);
  });
});
