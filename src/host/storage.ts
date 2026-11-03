import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export class JsonStorage {
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly directory: string) {}

  async read<T>(name: string, fallback: T): Promise<T> {
    try {
      return JSON.parse(await readFile(join(this.directory, `${name}.json`), 'utf8')) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
      throw error;
    }
  }

  write(name: string, value: unknown): Promise<void> {
    const json = JSON.stringify(value, null, 2);
    const write = this.pending.then(async () => {
      await mkdir(this.directory, { recursive: true });
      const target = join(this.directory, `${name}.json`);
      const temporary = `${target}.${randomUUID()}.tmp`;
      await writeFile(temporary, json, 'utf8');
      await rename(temporary, target);
    });
    this.pending = write.catch(() => {});
    return write;
  }

  flush() {
    return this.pending;
  }
}
