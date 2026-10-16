import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { cleanText } from '../common/cafe-rules';
import { hashPassword } from '../common/crypto';
import { AppError, pgCode } from '../common/errors';
import { DbService } from '../db/db.service';
import { allow, KV, KvStore } from '../kv/kv.store';
import { CAFE_EVENTS_SQL as SQL } from './cafe-events.sql';

export interface CafeRegistration {
  name: string;
  branch_name?: string | null;
  address: string;
  city: string;
  district?: string | null;
  email: string;
  password: string;
}

@Injectable()
export class CafeRegisterService {
  constructor(
    private readonly db: DbService,
    @Inject(KV) private readonly kv: KvStore,
  ) {}

  /**
   * İşletme kaydı: kafe `pending` doğar (kullanıcılara görünmez, QR verilmez) ve yönetici onayı bekler.
   * E-posta doğrulaması yoktur; kapı, yöneticinin işletmeyi doğrulamasıdır.
   */
  async register(input: CafeRegistration, ip: string): Promise<{ ok: true; status: 'pending' }> {
    const email = input.email.trim().toLowerCase();
    if (!(await allow(this.kv, `rl:caferegister:ip:${ip}`, 3, 3600)) || !(await allow(this.kv, `rl:caferegister:email:${email}`, 3, 86400))) {
      throw new AppError('TOO_MANY_REQUESTS', 'Çok fazla kayıt denemesi. Daha sonra tekrar dene.', 429);
    }
    const name = cleanText(input.name, 'Ad', 2, 60, true)!;
    const branch = cleanText(input.branch_name, 'Şube adı', 1, 60, false);
    const address = cleanText(input.address, 'Adres', 5, 200, true)!;
    const city = cleanText(input.city, 'Şehir', 2, 60, true)!;
    const district = cleanText(input.district, 'İlçe', 1, 60, false);
    if (input.password.length < 12 || input.password.length > 200 || input.password.toLowerCase().includes(email.split('@')[0])) {
      throw new AppError('WEAK_PASSWORD', 'Parola en az 12 karakter olmalı ve e-postanı içermemeli.', 422);
    }
    const hash = await hashPassword(input.password);
    try {
      await this.db.tx(async (c) => {
        const cafeId = (await c.query(SQL.insertCafe, [name, branch, address, city, district, randomBytes(32)])).rows[0].id;
        await c.query(SQL.insertOwner, [cafeId, email, hash]);
      });
    } catch (err) {
      if (pgCode(err) === '23505') throw new AppError('EMAIL_TAKEN', 'Bu e-posta ile zaten bir kafe hesabı var.', 409);
      throw err;
    }
    return { ok: true, status: 'pending' };
  }
}
