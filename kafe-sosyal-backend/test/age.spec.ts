import assert from 'node:assert/strict';
import { computeAge, isoDate, parseIsoDate } from '../src/common/age';

describe('doğum tarihi ve yaş', () => {
  it('geçerli tarihleri ayrıştırır', () => {
    assert.deepEqual(parseIsoDate('2000-02-29'), { y: 2000, m: 2, d: 29 });
    assert.equal(isoDate({ y: 2000, m: 2, d: 9 }), '2000-02-09');
  });

  it('takvimde olmayan veya bozuk tarihleri reddeder', () => {
    for (const bad of ['2001-02-29', '2000-02-30', '2000-13-01', '2000-00-10', '20000101', '2000-1-1', '', 'abc']) {
      assert.equal(parseIsoDate(bad), null, bad);
    }
  });

  const now = new Date('2026-10-05T12:00:00Z'); // İstanbul'da 5 Ekim 2026

  it('doğum günü bugünse yaş tamamlanmıştır', () => {
    assert.equal(computeAge({ y: 2008, m: 10, d: 5 }, now), 18);
  });

  it('doğum günü yarınsa bir yaş eksiktir', () => {
    assert.equal(computeAge({ y: 2008, m: 10, d: 6 }, now), 17);
  });

  it('doğum günü geçmişse tamamlanmıştır', () => {
    assert.equal(computeAge({ y: 2008, m: 10, d: 4 }, now), 18);
    assert.equal(computeAge({ y: 2000, m: 1, d: 1 }, now), 26);
  });

  it('saat dilimi dikkate alınır (UTC akşamı = İstanbul ertesi gün)', () => {
    const lateUtc = new Date('2026-10-04T22:30:00Z'); // İstanbul: 5 Ekim 01:30
    assert.equal(computeAge({ y: 2008, m: 10, d: 5 }, lateUtc, 'Europe/Istanbul'), 18);
    assert.equal(computeAge({ y: 2008, m: 10, d: 5 }, lateUtc, 'UTC'), 17);
  });
});
