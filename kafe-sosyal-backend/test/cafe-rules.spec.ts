import assert from 'node:assert/strict';
import { cleanText, validateCoord, validateOpeningHours } from '../src/common/cafe-rules';

describe('kafe verisi doğrulama', () => {
  it('metni kırpar ve boşlukları sadeleştirir', () => assert.equal(cleanText('  Coffee   Lab ', 'Ad', 2, 60, true), 'Coffee Lab'));
  it('zorunlu alan boşsa reddeder, isteğe bağlıysa null verir', () => {
    assert.throws(() => cleanText('  ', 'Ad', 2, 60, true), { code: 'INVALID_CAFE_DATA' });
    assert.equal(cleanText(null, 'Açıklama', 1, 500, false), null);
  });
  it('uzunluk sınırlarını ve kontrol karakterini denetler', () => {
    assert.throws(() => cleanText('a', 'Ad', 2, 60, true), { code: 'INVALID_CAFE_DATA' });
    assert.throws(() => cleanText('a'.repeat(61), 'Ad', 2, 60, true), { code: 'INVALID_CAFE_DATA' });
    assert.throws(() => cleanText('ab\u0000cd', 'Ad', 2, 60, true), { code: 'INVALID_CAFE_DATA' });
    assert.equal(cleanText('satır\nsonu', 'Açıklama', 1, 500, false), 'satır\nsonu');
    assert.throws(() => cleanText(42, 'Ad', 2, 60, true), { code: 'INVALID_CAFE_DATA' });
  });
  it('çalışma saatlerini doğrular', () => {
    assert.deepEqual(validateOpeningHours({}), {});
    assert.deepEqual(validateOpeningHours({ mon: [['09:00', '23:00']], fri: [['18:00', '02:00']] }), { mon: [['09:00', '23:00']], fri: [['18:00', '02:00']] });
    assert.throws(() => validateOpeningHours({ xyz: [] }), { code: 'INVALID_CAFE_DATA' });
    assert.throws(() => validateOpeningHours({ mon: [['9', '23:00']] }), { code: 'INVALID_CAFE_DATA' });
    assert.throws(() => validateOpeningHours({ mon: [['09:00', '25:00']] }), { code: 'INVALID_CAFE_DATA' });
    assert.throws(() => validateOpeningHours({ mon: [['01:00', '02:00'], ['03:00', '04:00'], ['05:00', '06:00'], ['07:00', '08:00']] }), { code: 'INVALID_CAFE_DATA' });
    assert.throws(() => validateOpeningHours([]), { code: 'INVALID_CAFE_DATA' });
    assert.throws(() => validateOpeningHours(null), { code: 'INVALID_CAFE_DATA' });
  });
  it('koordinatları denetler', () => {
    assert.equal(validateCoord(41.0, 'lat'), 41);
    assert.equal(validateCoord(null, 'lng'), null);
    assert.throws(() => validateCoord(91, 'lat'), { code: 'INVALID_CAFE_DATA' });
    assert.throws(() => validateCoord(181, 'lng'), { code: 'INVALID_CAFE_DATA' });
    assert.throws(() => validateCoord(NaN, 'lat'), { code: 'INVALID_CAFE_DATA' });
    assert.throws(() => validateCoord('41', 'lat'), { code: 'INVALID_CAFE_DATA' });
  });
});
