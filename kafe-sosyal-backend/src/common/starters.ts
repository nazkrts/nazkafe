export interface InterestRef {
  slug: string;
  label: string;
}

const TEMPLATES: Record<string, string> = {
  coffee: 'Buradaki kahveyi denedin mi? Ne önerirsin?',
  cinema: 'Son izlediğin güzel film neydi?',
  music: 'Bu aralar en çok ne dinliyorsun?',
  games: 'En son hangi oyunu oynadın?',
  'board-games': 'Favori masa oyunun hangisi?',
  entrepreneurship: 'Üzerinde çalıştığın bir fikir ya da proje var mı?',
  tech: 'Son zamanlarda ilgini çeken bir teknoloji var mı?',
  books: 'Şu an ne okuyorsun?',
  sports: 'Hangi sporu yapıyorsun ya da takip ediyorsun?',
  running: 'Genelde nerede koşuyorsun?',
  fitness: 'Antrenman düzenin nasıl, haftada kaç gün?',
  hiking: 'En sevdiğin yürüyüş rotası neresi?',
  travel: 'Son gittiğin yer neresiydi?',
  art: 'Son gördüğün sergi ya da eser hangisiydi?',
  photography: 'Genelde neyi çekmeyi seversin?',
  cooking: 'En iyi yaptığın yemek ne?',
  languages: 'Hangi dili öğreniyorsun ya da pratik yapmak istersin?',
  theatre: 'Son izlediğin oyun hangisiydi?',
  pets: 'Evcil hayvanın var mı?',
};

const GENERIC = ['Burayı sık sık kullanır mısın?', 'Bugün buraya nasıl bir planla geldin?'];

/**
 * Ortak ilgi alanlarından sohbet başlangıç önerileri (en fazla 4). Öneridir: istemci düzenlenebilir
 * şekilde gösterir, kullanıcı göndermeden değiştirebilir.
 */
export function buildStarters(shared: InterestRef[]): string[] {
  const out: string[] = [];
  for (const i of shared) {
    if (out.length >= 3) break;
    out.push(TEMPLATES[i.slug] ?? `${i.label} konusunda en sevdiğin şey ne?`);
  }
  out.push(GENERIC[0]);
  if (out.length < 2) out.push(GENERIC[1]);
  return [...new Set(out)].slice(0, 4);
}
