# Kafe Sosyal: Mobil uygulama (iOS ve Android)

Expo (React Native). `../kafe-sosyal-backend` API'sine bağlanır: giriş/kayıt, kafe listesi, kamerayla QR okutup check-in, niyet ve görünürlük, keşif, eşleşme, sohbet.

## Çalıştırma

```bash
# 1) Backend'i başlat (kafe-sosyal-backend/README.md)
# 2) Bu klasörde:
npm install
EXPO_PUBLIC_API_URL=http://<bilgisayarın-yerel-ip>:3000/v1 npx expo start
```

- Telefona Expo Go uygulamasını kur, terminaldeki QR'ı okut. Telefon ve bilgisayar aynı Wi-Fi'de olmalı.
- Android emülatöründe adres `http://10.0.2.2:3000/v1`, iOS simülatöründe `http://localhost:3000/v1`.
- Geliştirmede doğrulama kodu (OTP) backend sunucu loguna yazılır.
- Kafe QR'ı `kafeapp://checkin?c=<kafe-id>&t=<token>` biçimindedir. Geliştirmede backend klasöründe `npm run qr -- <kafe-id>` bu bağlantıyı üretir; bir QR oluşturucuyla koda çevirip kamerayla okutabilirsin.

## Notlar

- Tokenlar cihazın güvenli deposunda (`expo-secure-store`) saklanır.
- Fotoğraflar henüz gösterilmiyor (`/v1/media/:key` yetkili istek ister); kartlarda baş harf kullanılır.
- "Masama davet et" ve "Rahatsızım" henüz mobil uygulamada yok; backend'de hazırlar.
