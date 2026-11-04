import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { InstalledContent, Instance, InstanceBackup } from '../../../shared/contracts';
import { tr } from '../../../shared/i18n';
import { inside } from '../../files';

export interface BackupManifest {
  formatVersion: 1;
  sha256: string;
  backup: InstanceBackup;
  instance: Instance;
  content: InstalledContent[];
}

/** Only committed directories are listed; interrupted writes stay in .pending. */
export class BackupRepository {
  readonly root: string;
  readonly deleting = new Set<string>();
  constructor(dataRoot: string) {
    this.root = join(dataRoot, 'backups');
  }

  directory(id: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
      throw new Error(tr('backups.invalidBackup'));
    return inside(this.root, id);
  }

  async initialize() {
    await mkdir(this.root, { recursive: true });
    await rm(inside(this.root, '.pending'), { recursive: true, force: true });
  }

  async read(id: string) {
    const manifest = JSON.parse(
      await readFile(join(this.directory(id), 'manifest.json'), 'utf8'),
    ) as BackupManifest;
    if (manifest.formatVersion !== 1 || manifest.backup.id !== id)
      throw new Error(tr('backups.invalidBackup'));
    return manifest;
  }

  async list(instanceId?: string) {
    const entries = await readdir(this.root, { withFileTypes: true });
    const backups = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map(async (entry) => (await this.read(entry.name)).backup),
    );
    return backups
      .filter((backup) => !instanceId || backup.instanceId === instanceId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async begin() {
    const id = randomUUID();
    const staging = inside(this.root, `.pending/${id}`);
    await mkdir(staging, { recursive: true });
    return { id, staging, archive: join(staging, 'instance.zip') };
  }

  async commit(staging: string, manifest: BackupManifest) {
    manifest.backup.size = (await stat(join(staging, 'instance.zip'))).size;
    await writeFile(join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    await rename(staging, this.directory(manifest.backup.id));
  }

  async remove(id: string) {
    if (this.deleting.has(id)) throw new Error(tr('backups.deleting'));
    this.deleting.add(id);
    try {
      const directory = this.directory(id);
      const pending = inside(this.root, `.pending/${id}`);
      await mkdir(join(this.root, '.pending'), { recursive: true });
      await rename(directory, pending);
      await rm(pending, { recursive: true });
    } finally {
      this.deleting.delete(id);
    }
  }
}
