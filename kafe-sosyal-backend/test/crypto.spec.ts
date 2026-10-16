import assert from 'node:assert/strict';
import { decryptField, encryptField, randomOtp, randomToken, safeEqual, sha256Hex } from '../src/common/crypto';

const key = Buffer.alloc(32, 7);

describe('şifreleme yardımcıları', () => {
  it('şifrele/çöz gidiş-dönüş', () => {
    const enc = encryptField(key, '+905321234567');
    assert.equal(decryptField(key, enc), '+905321234567');
    assert.ok(!enc.toString('utf8').includes('905321234567'));
  });

  it('aynı metin her seferinde farklı şifrelenir (rastgele IV)', () => {
    assert.notDeepEqual(encryptField(key, 'a'), encryptField(key, 'a'));
  });

  it('kurcalanmış veri veya yanlış anahtar hata verir', () => {
    const enc = encryptField(key, 'gizli');
    const tampered = Buffer.from(enc);
    tampered[tampered.length - 1] ^= 1;
    assert.throws(() => decryptField(key, tampered));
    assert.throws(() => decryptField(Buffer.alloc(32, 9), enc));
  });

  it('safeEqual', () => {
    assert.equal(safeEqual('abc', 'abc'), true);
    assert.equal(safeEqual('abc', 'abd'), false);
    assert.equal(safeEqual('abc', 'abcd'), false);
  });

  it('OTP 6 haneli rakamdır', () => {
    for (let i = 0; i < 300; i++) assert.match(randomOtp(), /^\d{6}$/);
  });

  it('rastgele token ve sha256', () => {
    assert.notEqual(randomToken(), randomToken());
    assert.match(sha256Hex('x'), /^[0-9a-f]{64}$/);
  });
});
