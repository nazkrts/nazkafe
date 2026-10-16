import { Inject, Injectable } from '@nestjs/common';
import { TokensService } from '../auth/tokens.service';
import { computeAge, parseIsoDate } from '../common/age';
import { encryptField } from '../common/crypto';
import { AppError, pgCode } from '../common/errors';
import { identifierHash } from '../common/identifier';
import { validateDisplayName } from '../common/profile-rules';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { DbService } from '../db/db.service';
import { KV, KvStore } from '../kv/kv.store';
import { CompleteOnboardingDto } from './onboarding.dto';
import { LEGAL_DOCUMENTS } from './legal';
import { ONBOARDING_SQL } from './onboarding.sql';

const AGE_GATE_TTL_SEC = 24 * 3600;
const MAX_PLAUSIBLE_AGE = 100;

@Injectable()
export class OnboardingService {
  constructor(
    private readonly db: DbService,
    private readonly tokens: TokensService,
    @Inject(KV) private readonly kv: KvStore,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  /** OTP doğrulamasından sonra hesabı tek adımda oluşturur: yaş, ad ve rızalar birlikte doğrulanır. */
  async complete(dto: CompleteOnboardingDto) {
    const id = await this.tokens.verifyOnboarding(dto.onboarding_token);
    const h = identifierHash(id, this.cfg.phonePepper);

    // 18 yaş altı denemeden sonra aynı telefon/e-posta ile farklı doğum tarihi denenemesin
    if (await this.kv.get(`agegate:${h}`)) throw this.ageError();

    const name = validateDisplayName(dto.display_name);

    const birth = parseIsoDate(dto.birth_date);
    if (!birth) throw new AppError('INVALID_BIRTH_DATE', 'Doğum tarihi geçerli değil.', 422);
    const age = computeAge(birth, new Date(), this.cfg.timezone);
    if (age < this.cfg.minAge) {
      await this.kv.set(`agegate:${h}`, '1', AGE_GATE_TTL_SEC);
      throw this.ageError();
    }
    if (age > MAX_PLAUSIBLE_AGE) throw new AppError('INVALID_BIRTH_DATE', 'Doğum tarihi geçerli değil.', 422);

    // Zorunlu metinlerin hepsi, güncel sürümle ve onaylanmış olmalı
    const given = new Map(dto.consents.map((c) => [c.type, c]));
    for (const doc of LEGAL_DOCUMENTS.filter((d) => d.required)) {
      const c = given.get(doc.type);
      if (!c || !c.granted || c.version !== doc.version) {
        throw new AppError('CONSENT_REQUIRED', `"${doc.title}" onaylanmadan kayıt tamamlanamaz.`, 422);
      }
    }

    const userId = await this.db
      .tx(async (client) => {
        const phone = id.kind === 'phone';
        const res = await client.query(ONBOARDING_SQL.insertUser, [
          phone ? h : null,
          phone ? encryptField(this.cfg.dataEncKey, id.value) : null,
          phone ? null : id.value,
          name,
          dto.birth_date,
        ]);
        const newId: string = res.rows[0].id;
        for (const c of given.values()) {
          // Sürümü bilinmeyen/eski metinler için rıza kaydı tutulmaz
          const doc = LEGAL_DOCUMENTS.find((d) => d.type === c.type);
          if (doc && doc.version === c.version) {
            await client.query(ONBOARDING_SQL.insertConsent, [newId, c.type, c.version, c.granted]);
          }
        }
        return newId;
      })
      .catch((err) => {
        if (pgCode(err) === '23505') throw new AppError('ACCOUNT_EXISTS', 'Bu hesap zaten kayıtlı, giriş yapmayı dene.', 409);
        // Saat dilimi farkı yüzünden veritabanı 18 yaş kısıtı da devreye girebilir
        if (pgCode(err) === '23514') throw this.ageError();
        throw err;
      });

    const tokens = await this.tokens.issue(userId);
    return { user: { id: userId, display_name: name }, ...tokens };
  }

  private ageError(): AppError {
    return new AppError('AGE_RESTRICTED', `Uygulamayı kullanmak için en az ${this.cfg.minAge} yaşında olmalısın.`, 403);
  }
}
