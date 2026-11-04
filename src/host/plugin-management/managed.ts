import { randomUUID } from 'node:crypto';
import { mkdir, realpath, rename, rm } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { tr } from '../../shared/i18n';
import type { PluginInstallPreview } from '../../shared/plugin-distribution';
import { readManifest } from './manifest';

/** Only directories created under this root are ever removed by plugin management. */
export class ManagedInstallation {
  readonly root: string;
  constructor(data: string) {
    this.root = join(data, 'plugins');
  }
  async stage(directory: string, preview: PluginInstallPreview) {
    const manifest = await readManifest(directory);
    if (!isDeepStrictEqual(manifest, preview.package.manifest))
      throw new Error(tr('pluginDist.packageMismatch'));
    const parent = join(this.root, manifest.id);
    await mkdir(parent, { recursive: true });
    const target = join(
      parent,
      `${manifest.version}-${preview.package.sha256.slice(0, 12)}-${randomUUID()}`,
    );
    await rename(directory, target);
    return {
      directory: target,
      version: manifest.version,
      source: preview.source,
      sha256: preview.package.sha256,
    };
  }
  async verify(path: string) {
    const root = await realpath(this.root);
    const target = await realpath(path);
    const relation = relative(root, target);
    if (!relation || relation.startsWith('..') || isAbsolute(relation))
      throw new Error(tr('pluginDist.immutable'));
    return target;
  }
  async remove(path: string) {
    await rm(await this.verify(path), { recursive: true, force: true });
  }
}
