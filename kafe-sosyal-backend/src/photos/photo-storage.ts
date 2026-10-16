import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const PHOTO_STORAGE = Symbol('PHOTO_STORAGE');

/** Anahtar biçimi: <uuid>.jpg|png. Eğik çizgi/nokta-nokta yok; yol gezme (path traversal) mümkün değil. */
export const PHOTO_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$/;

/**
 * Fotoğraf deposu. Production'da S3/GCS benzeri bir uygulama (imzalı, süreli URL ile) bu arayüzü karşılar;
 * yerel disk geliştirme ve tek sunuculu kurulum içindir.
 */
export interface PhotoStorage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

function assertKey(key: string): void {
  if (!PHOTO_KEY_RE.test(key)) throw new Error('Geçersiz depo anahtarı');
}

export class LocalPhotoStorage implements PhotoStorage {
  private ready?: Promise<unknown>;
  constructor(private readonly dir: string) {}

  private init(): Promise<unknown> {
    return (this.ready ??= mkdir(this.dir, { recursive: true, mode: 0o700 }));
  }

  async put(key: string, data: Buffer): Promise<void> {
    assertKey(key);
    await this.init();
    await writeFile(join(this.dir, key), data, { mode: 0o600, flag: 'wx' });
  }

  async get(key: string): Promise<Buffer | null> {
    assertKey(key);
    try {
      return await readFile(join(this.dir, key));
    } catch (err: any) {
      if (err?.code === 'ENOENT') return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    assertKey(key);
    await rm(join(this.dir, key), { force: true });
  }
}

/** Testler için bellek içi depo. */
export class MemoryPhotoStorage implements PhotoStorage {
  readonly files = new Map<string, Buffer>();
  async put(key: string, data: Buffer): Promise<void> {
    assertKey(key);
    this.files.set(key, data);
  }
  async get(key: string): Promise<Buffer | null> {
    assertKey(key);
    return this.files.get(key) ?? null;
  }
  async delete(key: string): Promise<void> {
    assertKey(key);
    this.files.delete(key);
  }
}
