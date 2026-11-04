import { mkdir } from 'node:fs/promises';
import { tr } from '../../shared/i18n';
import { inside } from '../files';
import { extractEntry, open, readAllEntries } from '../zip';

export async function unpackPlugin(archive: string, directory: string, signal: AbortSignal) {
  const zip = await open(archive);
  try {
    const entries = await readAllEntries(zip);
    const names = new Set<string>();
    let size = 0;
    if (entries.length > 10000) throw new Error(tr('pluginDist.archive'));
    for (const entry of entries) {
      const path = entry.fileName.replace(/\/$/, '');
      inside(directory, path);
      const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
      if ((mode && mode !== 0o100000 && mode !== 0o040000) || names.has(path.toLowerCase()))
        throw new Error(tr('pluginDist.archive'));
      names.add(path.toLowerCase());
      size += entry.uncompressedSize;
      if (size > 256 * 1024 * 1024) throw new Error(tr('pluginDist.archive'));
    }
    await mkdir(directory, { recursive: true });
    for (const entry of entries) {
      signal.throwIfAborted();
      if (entry.fileName.endsWith('/')) continue;
      await extractEntry(zip, entry, directory, entry.fileName, signal);
    }
  } finally {
    zip.close();
  }
}
