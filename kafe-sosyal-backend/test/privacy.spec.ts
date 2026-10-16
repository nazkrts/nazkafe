import assert from 'node:assert/strict';
import { formatCount } from '../src/common/privacy';

describe('sayı gizleme (kafe kartı)', () => {
  it('0 → none', () => assert.deepEqual(formatCount(0), { bucket: 'none', label: '0' }));
  it('1-2 → birkaç', () => {
    assert.equal(formatCount(1).bucket, 'few');
    assert.equal(formatCount(2).bucket, 'few');
    assert.notEqual(formatCount(2).label, '2');
  });
  it('3-9 → tam sayı', () => {
    assert.deepEqual(formatCount(3), { bucket: 'exact', label: '3' });
    assert.deepEqual(formatCount(9), { bucket: 'exact', label: '9' });
  });
  it('10 ve üstü → 10+', () => {
    assert.deepEqual(formatCount(10), { bucket: 'many', label: '10+' });
    assert.deepEqual(formatCount(14), { bucket: 'many', label: '10+' });
    assert.deepEqual(formatCount(500), { bucket: 'many', label: '10+' });
  });
  it('geçersiz değerler none', () => {
    assert.equal(formatCount(-4).bucket, 'none');
    assert.equal(formatCount(NaN).bucket, 'none');
  });
});
