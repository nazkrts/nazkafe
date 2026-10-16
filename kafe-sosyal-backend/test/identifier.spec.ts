import assert from 'node:assert/strict';
import { identifierHash, parseIdentifier } from '../src/common/identifier';

describe('telefon / e-posta normalizasyonu', () => {
  it('Türkiye telefon biçimlerini +90 formuna çevirir', () => {
    for (const raw of ['0532 123 45 67', '05321234567', '532-123-45-67', '+90 (532) 123 45 67', '905321234567']) {
      assert.deepEqual(parseIdentifier(raw), { kind: 'phone', value: '+905321234567' }, raw);
    }
  });

  it('yabancı numarayı korur', () => {
    assert.deepEqual(parseIdentifier('+44 7911 123456'), { kind: 'phone', value: '+447911123456' });
  });

  it('e-postayı küçük harfe çevirir', () => {
    assert.deepEqual(parseIdentifier('  Elif@Ornek.COM '), { kind: 'email', value: 'elif@ornek.com' });
  });

  it('geçersiz girdileri reddeder', () => {
    for (const bad of ['', '123', 'a@b', '@x.com', 'elif@', '0532 123', 'abc']) {
      assert.equal(parseIdentifier(bad), null, bad);
    }
  });

  it('özet kararlı, anahtara ve türe bağlıdır', () => {
    const id = { kind: 'phone' as const, value: '+905321234567' };
    assert.equal(identifierHash(id, 'pepper-1-pepper-1'), identifierHash(id, 'pepper-1-pepper-1'));
    assert.notEqual(identifierHash(id, 'pepper-1-pepper-1'), identifierHash(id, 'pepper-2-pepper-2'));
    assert.notEqual(identifierHash(id, 'pepper-1-pepper-1'), identifierHash({ ...id, kind: 'email' }, 'pepper-1-pepper-1'));
    assert.match(identifierHash(id, 'pepper-1-pepper-1'), /^[0-9a-f]{64}$/);
  });
});
