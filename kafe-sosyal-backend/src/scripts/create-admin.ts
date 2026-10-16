import { loadEnvFile } from '../config/load-env';
loadEnvFile();

import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { hashPassword } from '../common/crypto';

/**
 * Yönetici hesabı oluşturur: npm run admin:create -- ayse@firma.com "Ayşe" [moderator|admin]
 * Parola ADMIN_PASSWORD ortam değişkeninden okunur; yoksa rastgele üretilip bir kez yazdırılır.
 */
async function main(): Promise<void> {
  const [emailArg, name, roleArg] = process.argv.slice(2);
  if (!emailArg || !name) throw new Error('Kullanım: npm run admin:create -- <e-posta> "<ad>" [moderator|admin]');
  const role = roleArg ?? 'moderator';
  if (role !== 'moderator' && role !== 'admin') throw new Error('Rol moderator veya admin olmalı');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL tanımlı olmalı');

  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD ?? randomBytes(18).toString('base64url');
  if (password.length < 12) throw new Error('Parola en az 12 karakter olmalı');

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO admins (email, password_hash, display_name, role) VALUES ($1, $2, $3, $4)`,
      [emailArg.trim().toLowerCase(), await hashPassword(password), name, role],
    );
    console.log(`Yönetici oluşturuldu: ${emailArg} (${role})`);
    if (generated) console.log(`Parola (yalnızca şimdi gösterilir): ${password}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
