# Kafe Sosyal: Web uygulaması (kullanıcı tarafı)

React + Vite. `../kafe-sosyal-backend` API'sine bağlanır (giriş/kayıt, kafeler ve QR ile check-in, keşif, eşleşme, sohbet).

## Çalıştırma

```bash
# 1) Backend'i başlat (kafe-sosyal-backend/README.md): http://localhost:3000/v1
# 2) Bu klasörde:
npm install
npm run dev        # http://localhost:5173  (/v1 istekleri backend'e yönlenir)
```

Backend farklı bir adreste ise: `API_URL=http://sunucu:3000 npm run dev`

## Notlar

- Geliştirmede doğrulama kodu (OTP) backend sunucu loguna yazılır.
- Check-in için kafe QR token'ı gerekir: backend klasöründe `npm run qr -- <kafe-id>`.
- Fotoğraflar henüz gösterilmiyor (`/v1/media/:key` yetkili istek ister); kartlarda baş harf kullanılır.
- Kafe paneli ve admin arayüzü bu uygulamada yok; tasarımları canvas'ta hazır.
