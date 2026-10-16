import assert from 'node:assert/strict';
import { isOpenAt } from '../src/common/opening-hours';

const TZ = 'Europe/Istanbul'; // UTC+3
const at = (iso: string) => new Date(iso);

describe('çalışma saatleri', () => {
  const hours = { mon: [['09:00', '23:00']] };

  it('aralık içinde açık', () => assert.equal(isOpenAt(hours, at('2026-10-05T07:00:00Z'), TZ), true)); // Pzt 10:00
  it('açılıştan önce kapalı', () => assert.equal(isOpenAt(hours, at('2026-10-05T05:00:00Z'), TZ), false)); // Pzt 08:00
  it('kapanıştan sonra kapalı', () => assert.equal(isOpenAt(hours, at('2026-10-05T20:30:00Z'), TZ), false)); // Pzt 23:30
  it('tanımsız gün kapalı', () => assert.equal(isOpenAt(hours, at('2026-10-06T08:00:00Z'), TZ), false)); // Sal 11:00

  it('hiç saat tanımlı değilse kısıtlama yok', () => {
    assert.equal(isOpenAt({}, at('2026-10-05T01:00:00Z'), TZ), true);
    assert.equal(isOpenAt(null, at('2026-10-05T01:00:00Z'), TZ), true);
  });

  const night = { fri: [['18:00', '02:00']] };
  it('gece yarısını aşan aralık: akşam açık', () => assert.equal(isOpenAt(night, at('2026-10-09T17:00:00Z'), TZ), true)); // Cum 20:00
  it('gece yarısını aşan aralık: ertesi gün 01:00 açık', () => assert.equal(isOpenAt(night, at('2026-10-09T22:00:00Z'), TZ), true)); // Cmt 01:00
  it('gece yarısını aşan aralık: 03:00 kapalı', () => assert.equal(isOpenAt(night, at('2026-10-10T00:00:00Z'), TZ), false)); // Cmt 03:00
  it('gece yarısını aşan aralık: açılıştan önce kapalı', () => assert.equal(isOpenAt(night, at('2026-10-09T14:00:00Z'), TZ), false)); // Cum 17:00

  it('bozuk saat biçimi açık saymaz', () => {
    assert.equal(isOpenAt({ mon: [['xx', 'yy']] }, at('2026-10-05T07:00:00Z'), TZ), false);
  });
});
