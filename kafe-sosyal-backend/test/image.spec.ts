import assert from 'node:assert/strict';
import { sanitizeImage, sniffImage } from '../src/common/image';
import { makeJpeg, makePng } from './helpers/images';

describe('görsel doğrulama ve üst veri temizliği', () => {
  it('imzadan tür bulur', () => {
    assert.equal(sniffImage(makeJpeg(300, 300)), 'jpeg');
    assert.equal(sniffImage(makePng(300, 300)), 'png');
    assert.equal(sniffImage(Buffer.from('GIF89a....')), null);
    assert.equal(sniffImage(Buffer.from('<svg onload=alert(1)>')), null);
  });

  it('JPEG: EXIF, yorum ve EOI sonrası fazlalık silinir; boyut okunur; JFIF kalır', () => {
    const src = makeJpeg(640, 480, { exif: 'GPS-41.0082N-28.9784E', comment: 'cihaz-seri-no', trailing: 'GIZLI-EK-VERI' });
    const out = sanitizeImage(src);
    assert.equal(out.type, 'jpeg');
    assert.deepEqual([out.width, out.height], [640, 480]);
    const text = out.data.toString('latin1');
    for (const s of ['GPS-41', 'Exif', 'cihaz-seri-no', 'GIZLI-EK-VERI']) assert.equal(text.includes(s), false, s);
    assert.ok(text.includes('JFIF'));
    assert.ok(out.data.length < src.length);
    assert.deepEqual([...out.data.subarray(-2)], [0xff, 0xd9]);
    // temizlenmiş çıktı tekrar temizlenince aynı kalır
    assert.ok(sanitizeImage(out.data).data.equals(out.data));
  });

  it('PNG: metin ve EXIF bölümleri ile IEND sonrası fazlalık silinir', () => {
    const out = sanitizeImage(makePng(300, 400, { text: 'gizli-konum', exif: 'GPS-VERI', trailing: 'EK-VERI' }));
    assert.equal(out.type, 'png');
    assert.deepEqual([out.width, out.height], [300, 400]);
    const text = out.data.toString('latin1');
    for (const s of ['gizli-konum', 'GPS-VERI', 'EK-VERI', 'tEXt', 'eXIf']) assert.equal(text.includes(s), false, s);
    assert.ok(text.includes('IDAT') && text.includes('IEND'));
  });

  it('çok küçük ve çok büyük boyutlar reddedilir', () => {
    assert.throws(() => sanitizeImage(makeJpeg(100, 100)), { code: 'IMAGE_TOO_SMALL' });
    assert.throws(() => sanitizeImage(makePng(199, 600)), { code: 'IMAGE_TOO_SMALL' });
    assert.throws(() => sanitizeImage(makeJpeg(9000, 300)), { code: 'IMAGE_TOO_LARGE' });
    assert.throws(() => sanitizeImage(makePng(7000, 7000)), { code: 'IMAGE_TOO_LARGE' });   // piksel sayısı sınırı
  });

  it('bozuk ve sahte dosyalar reddedilir', () => {
    assert.throws(() => sanitizeImage(Buffer.from('düz metin')), { code: 'INVALID_IMAGE' });
    const j = makeJpeg(300, 300);
    assert.throws(() => sanitizeImage(j.subarray(0, 30)), { code: 'INVALID_IMAGE' });       // yarım dosya
    assert.throws(() => sanitizeImage(Buffer.concat([j.subarray(0, 2), Buffer.from([0xff, 0xe1, 0xff, 0xff])])), { code: 'INVALID_IMAGE' });  // taşan bölüm uzunluğu
    const p = makePng(300, 300);
    assert.throws(() => sanitizeImage(p.subarray(0, p.length - 12)), { code: 'INVALID_IMAGE' });  // IEND yok
    assert.throws(() => sanitizeImage(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)])), { code: 'INVALID_IMAGE' });
  });
});
