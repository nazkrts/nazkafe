/** Testler için küçük, yapısal olarak geçerli JPEG/PNG üreticileri (içine gizli üst veri koyabilir). */
const u16 = (n: number) => Buffer.from([(n >> 8) & 0xff, n & 0xff]);
const u32 = (n: number) => Buffer.from([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);

export function makeJpeg(width: number, height: number, secrets: { exif?: string; comment?: string; trailing?: string } = {}): Buffer {
  const seg = (marker: number, payload: Buffer) => Buffer.concat([Buffer.from([0xff, marker]), u16(payload.length + 2), payload]);
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8])];
  parts.push(seg(0xe0, Buffer.concat([Buffer.from('JFIF\0'), Buffer.from([1, 1, 0, 0, 1, 0, 1, 0, 0])])));
  if (secrets.exif) parts.push(seg(0xe1, Buffer.concat([Buffer.from('Exif\0\0'), Buffer.from(secrets.exif)])));
  if (secrets.comment) parts.push(seg(0xfe, Buffer.from(secrets.comment)));
  parts.push(seg(0xc0, Buffer.concat([Buffer.from([8]), u16(height), u16(width), Buffer.from([3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1])])));
  parts.push(seg(0xda, Buffer.from([3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0])));
  parts.push(Buffer.from([0x12, 0x34, 0x56, 0x78, 0x9a, 0xff, 0xd9]));
  if (secrets.trailing) parts.push(Buffer.from(secrets.trailing));
  return Buffer.concat(parts);
}

export function makePng(width: number, height: number, secrets: { text?: string; exif?: string; trailing?: string } = {}): Buffer {
  const chunk = (type: string, data: Buffer) => Buffer.concat([u32(data.length), Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
  const parts: Buffer[] = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  parts.push(chunk('IHDR', Buffer.concat([u32(width), u32(height), Buffer.from([8, 2, 0, 0, 0])])));
  if (secrets.text) parts.push(chunk('tEXt', Buffer.from('Comment\0' + secrets.text)));
  if (secrets.exif) parts.push(chunk('eXIf', Buffer.from(secrets.exif)));
  parts.push(chunk('IDAT', Buffer.from([0x78, 0x9c, 1, 2, 3])));
  parts.push(chunk('IEND', Buffer.alloc(0)));
  if (secrets.trailing) parts.push(Buffer.from(secrets.trailing));
  return Buffer.concat(parts);
}
