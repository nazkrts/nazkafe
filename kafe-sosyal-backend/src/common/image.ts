import { AppError } from './errors';

export type ImageType = 'jpeg' | 'png';
export interface CleanImage {
  type: ImageType;
  data: Buffer;
  width: number;
  height: number;
}

export const MIN_SIDE = 200;
export const MAX_SIDE = 8000;
const MAX_PIXELS = 40_000_000;

const invalid = (msg = 'Geçersiz veya bozuk görsel.') => new AppError('INVALID_IMAGE', msg, 422);

/** Dosya imzasından (sihirli bayt) tür; istemcinin söylediği türe güvenilmez. */
export function sniffImage(b: Buffer): ImageType | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  return null;
}

/**
 * JPEG: EXIF/XMP (APP1; konum ve cihaz bilgisi burada), APP3-13, APP15 ve yorum bölümlerini siler.
 * JFIF (APP0), renk profili (APP2) ve Adobe (APP14) kalır. EOI'den sonraki fazlalık da atılır.
 */
function cleanJpeg(b: Buffer): CleanImage {
  const out: Buffer[] = [b.subarray(0, 2)];
  let i = 2;
  let width = 0;
  let height = 0;
  let sawSos = false;
  while (i < b.length) {
    if (b[i] !== 0xff) throw invalid();
    const m = b[i + 1];
    if (m === undefined) throw invalid();
    if (m === 0xff) { i++; continue; }                                   // dolgu baytı
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { out.push(b.subarray(i, i + 2)); i += 2; continue; }
    if (m === 0xd9) break;                                               // veri başlamadan EOI
    if (i + 4 > b.length) throw invalid();
    const len = b.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > b.length) throw invalid();
    if (m === 0xda) {                                                    // SOS: kalan sıkıştırılmış veri
      const rest = b.subarray(i);
      const eoi = rest.lastIndexOf(Buffer.from([0xff, 0xd9]));
      if (eoi < 0) throw invalid();
      out.push(rest.subarray(0, eoi + 2));
      sawSos = true;
      break;
    }
    if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) {
      if (len < 8) throw invalid();
      height = b.readUInt16BE(i + 5);
      width = b.readUInt16BE(i + 7);
    }
    const drop = m === 0xe1 || (m >= 0xe3 && m <= 0xed) || m === 0xef || m === 0xfe;
    if (!drop) out.push(b.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  if (!sawSos || !width || !height) throw invalid();
  return { type: 'jpeg', data: Buffer.concat(out), width, height };
}

const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

/** PNG: metin ve EXIF bölümlerini siler; IEND'den sonraki fazlalığı atar. */
function cleanPng(b: Buffer): CleanImage {
  const out: Buffer[] = [b.subarray(0, 8)];
  let i = 8;
  let width = 0;
  let height = 0;
  let sawIdat = false;
  let sawIend = false;
  let first = true;
  while (i + 12 <= b.length) {
    const len = b.readUInt32BE(i);
    const type = b.toString('latin1', i + 4, i + 8);
    const total = 12 + len;
    if (len > b.length || i + total > b.length) throw invalid();
    if (first) {
      if (type !== 'IHDR' || len !== 13) throw invalid();
      width = b.readUInt32BE(i + 8);
      height = b.readUInt32BE(i + 12);
      first = false;
    }
    if (type === 'IDAT') sawIdat = true;
    if (!PNG_DROP.has(type)) out.push(b.subarray(i, i + total));
    i += total;
    if (type === 'IEND') { sawIend = true; break; }
  }
  if (!sawIdat || !sawIend || !width || !height) throw invalid();
  return { type: 'png', data: Buffer.concat(out), width, height };
}

/** Türü doğrular, üst veriyi siler ve boyut sınırlarını uygular. */
export function sanitizeImage(b: Buffer): CleanImage {
  const type = sniffImage(b);
  if (!type) throw new AppError('INVALID_IMAGE', 'Yalnızca JPEG veya PNG yükleyebilirsin.', 422);
  const img = type === 'jpeg' ? cleanJpeg(b) : cleanPng(b);
  if (img.width < MIN_SIDE || img.height < MIN_SIDE) {
    throw new AppError('IMAGE_TOO_SMALL', `Fotoğraf en az ${MIN_SIDE}x${MIN_SIDE} piksel olmalı.`, 422);
  }
  if (img.width > MAX_SIDE || img.height > MAX_SIDE || img.width * img.height > MAX_PIXELS) {
    throw new AppError('IMAGE_TOO_LARGE', 'Fotoğrafın boyutları çok büyük.', 422);
  }
  return img;
}
