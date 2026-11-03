import { safeStorage } from 'electron';
import { JsonStorage } from '../host/storage';

export class SecretStorage {
  private values: Record<string, string> = {};
  private storage: JsonStorage;

  constructor(directory: string) {
    this.storage = new JsonStorage(directory);
  }

  async load() {
    this.values = await this.storage.read<Record<string, string>>('secrets', {});
  }

  private assertAvailable() {
    if (
      !safeStorage.isEncryptionAvailable() ||
      (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')
    ) {
      throw new Error('系统安全存储不可用，无法保存登录凭据。');
    }
  }

  get(key: string): string | undefined {
    const encrypted = this.values[key];
    if (!encrypted) return undefined;
    this.assertAvailable();
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  }

  async set(key: string, value: string) {
    this.assertAvailable();
    this.values[key] = safeStorage.encryptString(value).toString('base64');
    await this.storage.write('secrets', this.values);
  }

  async delete(key: string) {
    delete this.values[key];
    await this.storage.write('secrets', this.values);
  }
}
