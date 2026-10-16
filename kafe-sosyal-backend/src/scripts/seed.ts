import { loadEnvFile } from '../config/load-env';
loadEnvFile();

import { randomBytes } from 'node:crypto';
import { Client } from 'pg';

/** Yalnızca geliştirme: deneme için bir kafe, buluşma noktaları ve QR sırrı oluşturur. */
async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') throw new Error('Seed production ortamında çalıştırılamaz');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL tanımlı olmalı');

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const existing = await client.query(`SELECT id FROM cafes WHERE name = 'Coffee Lab (Demo)'`);
    let cafeId: string = existing.rows[0]?.id;
    if (!cafeId) {
      const res = await client.query(
        `INSERT INTO cafes (name, description, address, city, district, status, qr_secret)
         VALUES ('Coffee Lab (Demo)', 'Deneme kafesi', 'Örnek Sk. No:1', 'İstanbul', 'Kadıköy', 'active', $1)
         RETURNING id`,
        [randomBytes(32)],
      );
      cafeId = res.rows[0].id;
      await client.query(
        `INSERT INTO cafe_meeting_points (cafe_id, label) VALUES ($1, 'Kasanın yanı'), ($1, 'Giriş bölümü')`,
        [cafeId],
      );
      console.log('Demo kafe oluşturuldu.');
    } else {
      console.log('Demo kafe zaten var.');
    }
    console.log(`Kafe id: ${cafeId}`);
    console.log(`Güncel QR token için:  npm run qr -- ${cafeId}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
