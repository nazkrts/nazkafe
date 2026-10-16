import assert from 'node:assert/strict';
import { AppError } from '../src/common/errors';
import { validateBio, validateDisplayName } from '../src/common/profile-rules';

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? e.code : 'OTHER';
  }
  return undefined;
};

describe('profil kuralları', () => {
  it('geçerli adlar', () => {
    assert.equal(validateDisplayName('  Elif '), 'Elif');
    assert.equal(validateDisplayName('Ayşe   Nur'), 'Ayşe Nur');
    assert.equal(validateDisplayName('Ömer'), 'Ömer');
  });

  it('soyadı, rakam, iletişim bilgisi veya çok kısa ad reddedilir', () => {
    for (const bad of ['Elif Yılmaz Demir', 'E', 'elif123', 'ig: elif', 'a@b.com', '', '😀😀']) {
      assert.equal(codeOf(() => validateDisplayName(bad)), 'INVALID_DISPLAY_NAME', bad);
    }
  });

  it('bio: boş değerler null olur', () => {
    assert.equal(validateBio(null), null);
    assert.equal(validateBio(undefined), null);
    assert.equal(validateBio('   '), null);
    assert.equal(validateBio(' Merhaba ☕ '), 'Merhaba ☕');
  });

  it('bio: iletişim bilgisi reddedilir', () => {
    assert.equal(codeOf(() => validateBio('Bana yaz: 0532 123 45 67')), 'CONTACT_INFO_NOT_ALLOWED');
    assert.equal(codeOf(() => validateBio('insta: elif_k')), 'CONTACT_INFO_NOT_ALLOWED');
  });

  it('bio: 200 karakter sınırı', () => {
    assert.equal(validateBio('a'.repeat(200))!.length, 200);
    assert.equal(codeOf(() => validateBio('a'.repeat(201))), 'INVALID_BIO');
  });
});
