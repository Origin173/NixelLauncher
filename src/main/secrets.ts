import { safeStorage } from 'electron';
import { JsonStorage } from '../host/storage';
import { tr } from '../shared/i18n';

export class SecretStorage {
  private values: Record<string, string> = {};
  private storage: JsonStorage;
  private pending: Promise<void> = Promise.resolve();

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
      throw new Error(tr('secrets.systemSecureStorageIsUnavailableLoginCredentials'));
    }
  }

  get(key: string): string | undefined {
    const encrypted = this.values[key];
    if (!encrypted) return undefined;
    this.assertAvailable();
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  }

  private update(mutate: (values: Record<string, string>) => void) {
    const update = this.pending.then(async () => {
      const values = { ...this.values };
      mutate(values);
      await this.storage.write('secrets', values);
      this.values = values;
    });
    this.pending = update.catch(() => {});
    return update;
  }

  async set(key: string, value: string) {
    this.assertAvailable();
    const encrypted = safeStorage.encryptString(value).toString('base64');
    await this.update((values) => {
      values[key] = encrypted;
    });
  }

  async delete(key: string) {
    await this.update((values) => {
      delete values[key];
    });
  }
}
