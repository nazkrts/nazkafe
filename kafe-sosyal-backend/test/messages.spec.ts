import assert from 'node:assert/strict';
import { validateMessageBody } from '../src/common/message-rules';
import { buildStarters } from '../src/common/starters';

describe('mesaj kuralları', () => {
  it('kırpar ve kabul eder', () => assert.equal(validateMessageBody('  merhaba  ').body, 'merhaba'));
  it('boşu reddeder', () => assert.throws(() => validateMessageBody('   '), { code: 'INVALID_MESSAGE' }));
  it('1000 karakteri kabul, 1001 reddeder', () => {
    assert.doesNotThrow(() => validateMessageBody('a'.repeat(1000)));
    assert.throws(() => validateMessageBody('a'.repeat(1001)), { code: 'INVALID_MESSAGE' });
  });
  it('emojiyi tek karakter sayar', () => assert.doesNotThrow(() => validateMessageBody('😀'.repeat(1000))));
  it('kontrol karakterini reddeder', () => assert.throws(() => validateMessageBody('a\u0000b'), { code: 'INVALID_MESSAGE' }));
  it('satır sonuna izin verir', () => assert.doesNotThrow(() => validateMessageBody('a\nb')));
  it('iletişim bilgisini engellemez, işaretler', () => {
    const r = validateMessageBody('numaram 0532 123 45 67');
    assert.notEqual(r.contact, null);
  });
  it('normal mesajı işaretlemez', () => assert.equal(validateMessageBody('selam, nasılsın?').contact, null));
});

describe('sohbet başlangıçları', () => {
  it('ortak ilgi yoksa genel öneri verir', () => {
    const s = buildStarters([]);
    assert.ok(s.length >= 2);
  });
  it('ilgi alanına özel öneri üretir, en fazla 4', () => {
    const s = buildStarters([
      { slug: 'coffee', label: 'Kahve' }, { slug: 'music', label: 'Müzik' },
      { slug: 'books', label: 'Kitap' }, { slug: 'tech', label: 'Teknoloji' },
    ]);
    assert.ok(s.length <= 4);
    assert.ok(s[0].includes('kahve'));
  });
  it('bilinmeyen slug için etiketi kullanır', () => {
    assert.ok(buildStarters([{ slug: 'x', label: 'Origami' }])[0].includes('Origami'));
  });
});
