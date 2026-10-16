import assert from 'node:assert/strict';
import { buildEvent, floorToGroup } from '../src/common/event-rules';

const now = new Date('2026-10-13T12:00:00Z');
const ok = { title: 'Quiz Gecesi', starts_at: '2026-10-20T17:00:00Z', ends_at: '2026-10-20T19:00:00Z' };

describe('etkinlik kuralları', () => {
  it('geçerli etkinliği normalize eder', () => {
    const e = buildEvent({ ...ok, title: '  Quiz   Gecesi ', description: ' Eğlenceli ', category: 'quiz', capacity: 20 }, now, true);
    assert.equal(e.title, 'Quiz Gecesi'); assert.equal(e.description, 'Eğlenceli'); assert.equal(e.capacity, 20);
    assert.equal(buildEvent(ok, now, true).category, null);
  });
  it('başlık, kategori ve kapasiteyi denetler', () => {
    assert.throws(() => buildEvent({ ...ok, title: 'ab' }, now, true), { code: 'INVALID_CAFE_DATA' });
    assert.throws(() => buildEvent({ ...ok, category: 'dans' }, now, true), { code: 'INVALID_EVENT' });
    for (const c of [0, -1, 501, 1.5, '10']) assert.throws(() => buildEvent({ ...ok, capacity: c }, now, true), { code: 'INVALID_EVENT' });
    assert.equal(buildEvent({ ...ok, capacity: null }, now, true).capacity, null);
  });
  it('tarihleri denetler: biçim, sıra, süre, gelecek ve en fazla 180 gün', () => {
    assert.throws(() => buildEvent({ ...ok, starts_at: 'yarın' }, now, true), { code: 'INVALID_EVENT' });
    assert.throws(() => buildEvent({ ...ok, starts_at: '2026-13-45T00:00:00Z' }, now, true), { code: 'INVALID_EVENT' });
    assert.throws(() => buildEvent({ ...ok, ends_at: ok.starts_at }, now, true), { code: 'INVALID_EVENT' });
    assert.throws(() => buildEvent({ ...ok, ends_at: '2026-10-21T06:00:00Z' }, now, true), { code: 'INVALID_EVENT' });   // 13 saat
    assert.throws(() => buildEvent({ ...ok, starts_at: '2026-10-01T10:00:00Z', ends_at: '2026-10-01T11:00:00Z' }, now, true), { code: 'INVALID_EVENT' });
    assert.doesNotThrow(() => buildEvent({ ...ok, starts_at: '2026-10-01T10:00:00Z', ends_at: '2026-10-01T11:00:00Z' }, now, false));   // düzenlemede geçmiş korunur
    assert.throws(() => buildEvent({ ...ok, starts_at: '2027-06-01T10:00:00Z', ends_at: '2027-06-01T11:00:00Z' }, now, true), { code: 'INVALID_EVENT' });
  });
  it('k-grubu yuvarlama: 5 altı gizlenir, üstü 5\'in katına iner', () => {
    assert.equal(floorToGroup(4), null); assert.equal(floorToGroup(5), 5); assert.equal(floorToGroup(9), 5);
    assert.equal(floorToGroup(10), 10); assert.equal(floorToGroup(47), 45); assert.equal(floorToGroup(0), null);
  });
});
