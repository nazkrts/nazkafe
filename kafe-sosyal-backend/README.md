# Kafe Sosyal Keşif: Backend (MVP iskeleti)

NestJS + PostgreSQL + Redis. Kullanıcı tarafının çekirdeği hazır: kayıt/giriş, profil, kafe listesi, QR ile check-in, keşif, karşılıklı beğeni/eşleşme, fotoğraf yükleme/moderasyon, etkinlikler, mesajlaşma, "masama davet et", "Rahatsızım" ve engelleme. şikâyet ve moderasyon (admin API) ve kafe paneli API'si hazır; kafe/admin **arayüzleri** henüz yok (bkz. "Açık işler").

## Hızlı başlangıç

```bash
npm install
docker compose up -d              # PostgreSQL 16 + Redis 7
cp .env.example .env              # anahtarları üretmek için .env içindeki yorumlara bak
npm run db:migrate                # db/*.sql dosyalarını sırayla, bir kez uygular
npm run db:seed                   # demo kafe + buluşma noktaları (yalnızca geliştirme)
npm run admin:create -- ayse@firma.com "Ayşe" admin   # yönetici hesabı (parola bir kez yazdırılır)
npm run cafe:create -- <kafe-id> sahip@kafe.com owner   # kafe paneli hesabı (ya da POST /cafe/register ile kayıt + admin onayı)
npm run start:dev                 # http://localhost:3000/v1
```

Geliştirmede doğrulama kodu (OTP) sunucu loguna yazılır. Production'da gerçek SMS/e-posta sağlayıcısı bağlanana kadar kod gönderimi kapalıdır (`src/auth/otp-sender.ts`).

## Uçtan uca deneme (curl)

```bash
API=http://localhost:3000/v1
# 1) kod iste → sunucu logundaki kodu al
curl -s $API/auth/otp/request -H 'content-type: application/json' -d '{"identifier":"0532 111 22 33"}'
# 2) doğrula → yeni kullanıcıysa onboarding_token döner
curl -s $API/auth/otp/verify -H 'content-type: application/json' -d '{"identifier":"0532 111 22 33","code":"123456"}'
# 3) kaydı tamamla (yaş, ad ve rızalar tek adımda)
curl -s $API/onboarding/complete -H 'content-type: application/json' -d '{
  "onboarding_token":"<token>","display_name":"Ayşe","birth_date":"1998-05-17",
  "consents":[{"type":"privacy_notice","version":"1.0","granted":true},
              {"type":"explicit_consent","version":"1.0","granted":true},
              {"type":"community_rules","version":"1.0","granted":true}]}'
# 4) kafe QR'ı (kafe paneli gelene kadar): npm run qr -- <kafe-id>   → token + bağlantı yazar
# 5) check-in → niyet → görünür ol → keşif
curl -s $API/checkins/scan -H "authorization: Bearer $ACCESS" -H 'content-type: application/json' -d '{"cafe_id":"<id>","qr_token":"<token>"}'
curl -s -X PUT $API/checkins/current/intents    -H "authorization: Bearer $ACCESS" -H 'content-type: application/json' -d '{"intents":["coffee","friends"]}'
curl -s -X PUT $API/checkins/current/visibility -H "authorization: Bearer $ACCESS" -H 'content-type: application/json' -d '{"visible":true}'
curl -s $API/discover -H "authorization: Bearer $ACCESS"
curl -s -X POST $API/discover/<user_id>/like    -H "authorization: Bearer $ACCESS"
```

Geliştirmede `REQUIRE_APPROVED_PHOTO=false` olduğundan fotoğrafsız da görünür olunabilir. Fotoğraf yükleme denemesi: `curl -X POST $API/me/photos -H "authorization: Bearer $ACCESS" -H 'content-type: image/jpeg' --data-binary @foto.jpg` (en az 200x200 px). Production'da varsayılan `true`.

## Hazır uç noktalar (`/v1`)

| Alan | Uç noktalar |
|---|---|
| Auth | `POST /auth/otp/request`, `/auth/otp/verify`, `/auth/refresh`, `/auth/logout` |
| Kayıt | `POST /onboarding/complete`, `GET /legal/documents` |
| Fotoğraf | `GET/POST /me/photos` (ham gövde, `image/jpeg`/`image/png`), `DELETE /me/photos/:id`, `GET /media/:key` |
| Profil | `GET/PATCH/DELETE /me`, `GET /interests`, `PUT /me/interests`, `GET/POST /consents` |
| Kafeler | `GET /cafes`, `/cafes/:id`, `/cafes/:id/events` |
| Etkinlik (kullanıcı) | `POST/DELETE /events/:id/join`, `GET /me/events` |
| Check-in | `POST /checkins/scan`, `GET /checkins/current`, `PUT /checkins/current/intents`, `PUT /checkins/current/visibility`, `POST /checkins/current/end` |
| Keşif | `GET /discover`, `POST /discover/:userId/like`, `POST /discover/:userId/pass` |
| Engelleme | `POST /blocks`, `DELETE /blocks/:userId`, `GET /me/blocks` |
| Eşleşme / sohbet | `GET /matches`, `GET /matches/:id`, `POST /matches/:id/end`, `GET /matches/:id/starters`, `GET/POST /matches/:id/messages`, `POST /matches/:id/messages/read` |
| Masama davet et | `GET /invitations/meeting-points`, `POST /matches/:id/invitations`, `GET /invitations`, `POST /invitations/:id/respond` (`accept`/`later`/`decline`), `POST /invitations/:id/cancel` |
| Güvenlik | `POST /safety/alert` ("Rahatsızım"), `POST /reports` |
| Kafe paneli (ayrı token, 12 sa) | `POST /cafe/register`, `POST /cafe/auth/login`, `GET /cafe/me`, `PATCH /cafe/profile`, `GET /cafe/qr`, `GET/POST /cafe/meeting-points`, `PATCH /cafe/meeting-points/:id`, `GET/POST /cafe/events`, `PATCH /cafe/events/:id`, `POST /cafe/events/:id/cancel`, `GET /cafe/stats?days=`, `GET /cafe/safety-alerts`, `POST /cafe/safety-alerts/:id/ack` |
| Admin (ayrı token) | `POST /admin/auth/login`, `GET /admin/reports`, `GET /admin/reports/:id`, `POST /admin/reports/:id/resolve` (`dismiss`/`warn`/`suspend`/`ban`), `POST /admin/users/:id/restore`, `GET /admin/safety-alerts`, `POST /admin/safety-alerts/:id/handle`, `GET /admin/photos`, `GET /admin/photos/:id/file`, `POST /admin/photos/:id/review` (`approve`/`reject`), `GET /admin/cafes`, `POST /admin/cafes/:id/status` (`active`/`suspended`) |

Hata biçimi her yerde `{ "error": { "code": "QR_EXPIRED", "message": "..." } }`.

**API listesinden tek sapma:** `POST /onboarding/birth-date` yerine `POST /onboarding/complete` var. Şema `users` satırında doğum tarihi ve ad zorunlu olduğundan, hesap OTP sonrası tek adımda (yaş + ad + rıza birlikte doğrulanarak) oluşturuluyor; yarım kullanıcı kaydı oluşmuyor.

## Gizlilik kararları ve nerede uygulandıkları

- **Görünürlük varsayılan kapalı**; check-in en fazla 3 saat (veritabanı kısıtı `max_3h`), aynı anda tek aktif check-in (kısmi benzersiz indeks).
- **Konum alınmaz.** Kanıt, kafe başına dönen QR token'dır (HMAC, 5 dk pencere, bir önceki pencere payı). Eski ama gerçek token `QR_EXPIRED` olur. 10 dk içinde 3. farklı kafede check-in engellenir (`src/common/qr.ts`, `checkins.service.ts`).
- **Beğeni gizli:** karşılıklı olana kadar karşı taraf hiçbir şey öğrenmez; `like` yanıtı eşleşme yoksa her zaman `{ok:true}`. Aynı anda karşılıklı beğenide çift başına PostgreSQL kilidi eşleşmenin kaçmasını engeller (`discover.service.ts`).
- **Keşif kartı** yalnızca `user_id, display_name, age, photo_verified, photo_key, common_interests` içerir. Niyet (flört dahil), masa, mesafe, telefon, e-posta yok.
- **Engelleme karşılıklı:** keşif, beğeni ve eşleşme sorgularının hepsi iki yönü de kontrol eder.
- **Kafe kartı sayıları** kovalanır: 0 / "Birkaç" (1-2) / 3-9 tam / "10+".
- **Telefon** yalnızca HMAC özeti (`phone_hash`) ve AES-256-GCM şifreli kopya (`phone_enc`) olarak saklanır.
- **18 yaş:** uygulama + veritabanı kısıtı. 18 altı denemeden sonra aynı telefon/e-postayla 24 saat yeniden denenemez.
- **Bio/ad** iletişim bilgisi (telefon, e-posta, Instagram vb.) içeremez.
- **Hesap silme:** kişisel alanlar temizlenir, beğeniler/engeller silinir, eşleşmeler kapanır, mesajlar silinir (açık şikâyete konu olanlar hariç), tüm oturumlar kapanır.
- **Saklama süreleri** (bakım işi, 6 saatte bir): deneme kayıtları ve beğeniler 30 gün; check-in'lerde kullanıcı bağı 90 gün sonra kalkar.
- **Eşleşme/sohbet:** taraf olmayan, engelli veya pasif hesapla eşleşme hep aynı `MATCH_NOT_FOUND`; karşı tarafın kafede olup olmadığı döndürülmez. Ortak niyet (flört dahil) yalnızca iki taraf da seçtiyse görünür. Mesajda iletişim bilgisi engellenmez, işaretlenir ve gönderene uyarı gösterilir. Mesaj 1000 karakter, dakikada 30.
- **Masama davet et:** yalnızca eşleşmiş ve ikisi de aynı kafede check-in'deyken; bekleyen davet 15 dk geçerli; eşleşme başına tek açık davet; ret sonrası 3 saat yeniden davet yok; saatte 10 davet. Check-out, check-in süresi dolması veya engelleme açık davetleri iptal eder. Karşı taraf kafede değilse neden söylenmez (`INVITATION_UNAVAILABLE`). Alıcı "sonra" derse gönderen bunu "bekliyor" görür.
- **Rahatsızım:** karşı tarafı engeller, eşleşme ve davetleri kapatır, yüksek öncelikli (3) şikâyet açar, `notify_cafe` yalnızca kullanıcı açıkça isterse kayıt bırakır. Yanıtta 112 numarası döner. Karşı taraf yalnızca eşleşilmiş biri olabilir. Kafe ekibine kullanıcı kimliği gösterilmemeli (kafe paneli yapılırken uyulacak kural).
- **Şikâyet:** yalnızca eşleşilmiş ya da aynı kafedeki kişi için; yanıt hep `{ok:true}` (tekrar eden şikâyet sessizce kabul edilir, hiçbir şey sızmaz); kanıt mesajı doğrulanır; günde 10.
- **Moderasyon:** yönetici hesapları kullanıcılardan ayrı (`admins`, ayrı JWT rolü, 30 dk token, 5 hatalı denemede 15 dk kilit). Telefon/e-posta/doğum tarihi hiçbir admin yanıtında yok. Özel mesaj içeriğine her erişim `moderation_actions`'a `view_evidence` olarak yazılır. `warn/suspend/ban` için gerekçe zorunlu; `ban` ve yasak kaldırma yalnızca `admin` rolünde. Askıya alma/yasaklama oturumları, check-in'i ve davetleri anında kapatır.
- **Fotoğraf:** yalnızca JPEG/PNG; tür dosya imzasından doğrulanır; EXIF/XMP (konum), yorum ve dosya sonundaki fazlalık sunucuda silinir; 5 MB, 200-8000 px, en fazla 6, günde 10 yükleme. Yeni fotoğraf `pending` başlar; onaylanana kadar yalnızca sahibi görür. Başkası yalnızca onaylı, engelsiz, aktif hesabın fotoğrafını görür (aksi hep `PHOTO_NOT_FOUND`). Ret gerekçe ister ve dosyayı depodan siler. Hesap silmede satırlar ve dosyalar silinir.
- **Kafe paneli:** kafe hesapları (`owner` yazar, `staff` okur) kullanıcı/admin token'larından ayrı JWT rolü kullanır; her istekte hesap ve kafe durumu denetlenir; askıdaki kafe anında düşer. Yeni kafe `pending` doğar (listede yok, QR/etkinlik yok) ve yalnızca `admin` rolü onaylayabilir. QR sırrı hiçbir yanıtta dönmez. "Rahatsızım" uyarısı kafeye yalnızca kullanıcı istediyse ve kimliksiz (zaman + buluşma noktası) gösterilir.
- **İstatistik:** her saat/gün/niyet kovası en az 5 check-in içermiyorsa hiç gösterilmez; toplam 5'in katına aşağı yuvarlanır (gizli kovalar toplamdan geri hesaplanamasın diye). Sonuç en fazla 90 gün. Etkinlik katılımı gönüllüdür, kafeye yalnızca sayı olarak görünür.
- **Etkinlik:** katılımcı listesi kimseye gösterilmez; kullanıcı yalnızca "dolu mu" ve kendi katılımını görür. Kapasite etkinlik başına kilitle korunur (eşzamanlı kayıtta fazla kişi girmez). Hesap silmede katılımlar silinir.
- **Askıya alma** hemen etkili: guard her istekte kullanıcı durumunu kontrol eder.

## Testler ve doğrulama durumu

`npm test` (jest) `test/` altındaki 14 birim test dosyasını çalıştırır (98 test).

Bu iskelet, npm kayıt defterine erişimi olmayan bir ortamda yazıldı; bu yüzden **NestJS paketleriyle hiç derlenip çalıştırılmadı**. Şunlar yapıldı:

| Doğrulama | Sonuç |
|---|---|
| Şema + referans veri, PostgreSQL 16'ya yükleme | temiz |
| 168 SQL sorgusu, gerçek şemaya karşı `PREPARE` | hepsi geçerli |
| 84 birim testi (`node:test` ile) | geçti |
| 106 adımlık uçtan uca senaryo: gerçek servis kodu + gerçek PostgreSQL | geçti |
| Senaryo kasıtlı bozulan kurallar için (engelleme, bio filtresi, check-out'ta davet iptali, davet süresi, oturum kapatma, ban yetkisi, EXIF silme, fotoğraf erişimi, istatistik eşiği, etkinlik kapasite kilidi, kafe onayı yetkisi) | hatayı yakaladı |
| `migrate`, `seed`, `qr` betikleri; `qr` token'ı ile gerçek check-in | çalıştı |
| `tsc --strict`, paket tipleri için yapay bildirimlerle | temiz |

**Doğrulanamayanlar** (ilk `npm install` sonrası sen dene): controller/decorator bağlantıları, DTO doğrulaması (`class-validator`), gerçek `pg` ve `ioredis` davranışı, `nest build`, `package.json` içindeki sürüm aralıklarının kurulabilirliği. İlk iş: `npm install && npm run typecheck && npm test && npm run build`, sonra yukarıdaki curl akışı.

## CI (GitHub Actions)

`.github/workflows/ci.yml` her push/PR'da şunları çalıştırır: `npm install`, tip denetimi, birim testler, `npm run build`, `test:redis` (gerçek Redis), `test:e2e` (gerçek PostgreSQL, 106 adım) ve `test:smoke` (derlenmiş uygulamaya HTTP duman testi).

- `npm run test:e2e` BOŞ, migrate edilmiş ve adı `_e2e`/`_test` ile biten bir veritabanı ister (aksi halde çıkar; bilerek geçmek için `E2E_CONFIRM=yes`). Senaryo veri ekler; tekrar çalıştırmadan önce veritabanını sıfırlayın.
- `test:smoke` için `SMOKE_PASSWORD`, `BASE_URL`, `SERVER_LOG` ortam değişkenleri gerekir (workflow dosyasında örneği var).
- **Dürüst not:** e2e senaryosu burada `pg` taklidiyle 106/106 geçti; ancak gerçek `pg`, gerçek Redis, gerçek NestJS derlemesi ve smoke testi bu ortamda hiç çalıştırılamadı (npm erişimi yok). İlk CI koşusunda ortam kaynaklı hatalar (ör. `pg`'nin Date nesneleri döndürmesi, `package-lock.json` yokluğu) çıkabilir; bunlar beklenen ilk düzeltmelerdir.

## Açık işler

1. **Fotoğraf:** yükleme, EXIF temizliği ve manuel moderasyon hazır. Eksikler: gerçek **nesne depolama** (S3 vb. `PhotoStorage` uygulaması, imzalı süreli URL; yerel disk yalnızca tek sunucu/geliştirme için), **WebP** desteği, **otomatik içerik taraması** (çıplaklık/şiddet, sağlayıcı seçilmeli), **selfie doğrulama** (`photo_verified`), yeniden kodlama (şu an yalnızca üst veri siliniyor; piksel verisi olduğu gibi), depoda yetim dosya taraması (silme hatasında kalan dosyalar).
2. **Gerçek zamanlı sohbet:** WebSocket ve push bildirim (şu an istemci sorgulayarak çalışır). Kafe tarafı için de yeni davet/uyarı bildirimi yok.
3. **Arayüzler:** kafe paneli ve admin arayüzü (API'ler hazır).
4. **Güvenlik/operasyon eksikleri:** admin ve kafe girişinde **MFA** yok (yalnızca parola + deneme sınırı); kafe kaydında **e-posta doğrulaması** yok (kapı, yöneticinin işletmeyi doğrulamasıdır); parola sıfırlama yok; askıya alma/uyarı kullanıcıya bildirilmiyor (bildirim altyapısı yok); buluşma noktası tekrar kontrolü Türkçe I/ı farkını ayırt etmez.
5. Veri indirme (`/me/data-export`), Apple/Google girişi, etkinlik hatırlatma bildirimi.
6. **OTP sağlayıcısı** (SMS/e-posta) ve `trust proxy` ayarı (`main.ts` içinde yorumda).
7. **KVKK metinleri** (aydınlatma, açık rıza, topluluk kuralları) bir avukatla hazırlanmalı; `src/onboarding/legal.ts` yalnızca sürüm numaralarını tutar.
