/** .env varsa yükler (Node >= 20.12). Production'da değişkenler ortamdan gelir. */
export function loadEnvFile(): void {
  try {
    process.loadEnvFile();
  } catch {
    /* .env yok: ortam değişkenleri kullanılır */
  }
}
