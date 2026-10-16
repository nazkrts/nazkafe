import assert from 'node:assert/strict';
import { detectContactInfo } from '../src/common/contact-filter';

describe('iletişim bilgisi filtresi', () => {
  const blocked = [
    'ara beni 0532 123 45 67',
    '+90 532 123 45 67',
    '0 5 3 2 1 2 3 4 5 6 7',
    'mail: elif@ornek.com',
    'insta: elif_k',
    'ig - elif.k',
    'instagram @elifk',
    '@elif_k beni ekle',
    'wp: 5321234567',
    'www.sitem.com',
    'instagram.com/elifk',
    'https://t.me/elif',
  ];
  for (const text of blocked) {
    it(`yakalar: ${text}`, () => assert.notEqual(detectContactInfo(text), null));
  }

  const allowed = [
    'Yeni insanlarla tanışmayı seviyorum.',
    'Kahveyi çok severim ☕, hafta sonları koşuya çıkarım',
    '26 yaşındayım, 2 kedim var',
    'Instagram kullanmam',
    'Pazar günleri 10 km koşuyorum',
  ];
  for (const text of allowed) {
    it(`geçirir: ${text}`, () => assert.equal(detectContactInfo(text), null));
  }
});
