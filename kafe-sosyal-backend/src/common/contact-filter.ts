export type ContactKind = 'email' | 'url' | 'handle' | 'phone' | 'platform';

const PLATFORM = 'insta(?:gram)?|ig|snap(?:chat)?|whats\\s?app|wp|telegram|tg|tiktok|twitter|discord|facebook|fb';

const CHECKS: Array<[ContactKind, RegExp]> = [
  ['email', /[^\s@]+@[^\s@]+\.[a-z]{2,}/i],
  ['url', /(https?:\/\/|www\.)\S+/i],
  ['url', /\b[a-z0-9-]+\.(com|net|org|io|me|co|tr|app|ly|gg|link)\b/i],
  ['handle', /(^|[\s(])@[a-z0-9_.]{3,}/i],
  ['platform', new RegExp(`\\b(?:${PLATFORM})\\b\\s*(?:[:=\\-–]\\s*|\\s@)\\s*[\\w.]{3,}`, 'i')],
  // 10+ rakam, araya boşluk/ayraç girilmiş olsa bile
  ['phone', /(?:\+?\d[\s().\-]*){10,}/],
];

/**
 * Bio ve mesajlarda iletişim bilgisi (telefon, e-posta, bağlantı, kullanıcı adı) arar.
 * Bulursa türünü, yoksa null döner. Amaç kullanıcıyı uyarmak; mükemmel bir filtre değildir.
 */
export function detectContactInfo(text: string): ContactKind | null {
  for (const [kind, re] of CHECKS) {
    if (re.test(text)) return kind;
  }
  return null;
}
