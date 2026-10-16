import { loadEnvFile } from '../config/load-env';
loadEnvFile();

import { Client } from 'pg';
import { qrTokenFor, qrWindowOf } from '../common/qr';

/** Yalnızca geliştirme: bir kafenin şu anki dönen QR token'ını yazdırır (kafe paneli gelene kadar). */
async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') throw new Error('Bu araç production ortamında çalıştırılamaz');
  const cafeId = process.argv[2];
  if (!cafeId) throw new Error('Kullanım: npm run qr -- <kafe-id>');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL tanımlı olmalı');
  const windowSec = Number(process.env.QR_WINDOW_SECONDS ?? 300);

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query('SELECT id, name, qr_secret FROM cafes WHERE id = $1', [cafeId]);
    if (!rows[0]) throw new Error('Kafe bulunamadı');
    const now = Date.now();
    const window = qrWindowOf(now, windowSec);
    const token = qrTokenFor(rows[0].qr_secret, rows[0].id, window);
    const secondsLeft = (window + 1) * windowSec - Math.floor(now / 1000);
    console.log(`Kafe:      ${rows[0].name}`);
    console.log(`Token:     ${token}`);
    console.log(`Bağlantı:  kafeapp://checkin?c=${rows[0].id}&t=${token}`);
    console.log(`Geçerlilik: yaklaşık ${secondsLeft} sn sonra yenilenir (bir önceki pencere de kabul edilir)`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
