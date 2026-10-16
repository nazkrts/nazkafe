/**
 * Güncel hukuki metin sürümleri. Metinlerin kendisi (KVKK aydınlatma, açık rıza, topluluk kuralları)
 * bir avukat tarafından hazırlanıp onaylanmalı; sürüm değişince kullanıcıdan yeniden rıza alınır.
 */
export interface LegalDocument {
  type: 'privacy_notice' | 'explicit_consent' | 'community_rules' | 'marketing';
  version: string;
  title: string;
  required: boolean;
}

export const LEGAL_DOCUMENTS: LegalDocument[] = [
  { type: 'privacy_notice', version: '1.0', title: 'KVKK Aydınlatma Metni', required: true },
  { type: 'explicit_consent', version: '1.0', title: 'Açık Rıza Metni', required: true },
  { type: 'community_rules', version: '1.0', title: 'Topluluk Kuralları', required: true },
  { type: 'marketing', version: '1.0', title: 'Ticari Elektronik İleti İzni', required: false },
];

export const CONSENT_TYPES = LEGAL_DOCUMENTS.map((d) => d.type);
