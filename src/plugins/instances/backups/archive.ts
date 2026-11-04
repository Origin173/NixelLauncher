import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, lstat, mkdir, readdir, utimes } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ZipFile } from 'yazl';
import type { TaskContext } from '../../../shared/host-api';
import { tr } from '../../../shared/i18n';
import { inside } from '../../files';
import { extractEntry, open, readAllEntries } from '../../zip';

// Runtime working files and external launchers' credentials are not instance data.
const excluded = new Set([
  '.nixel',
  'launcher_accounts.json',
  'launcher_profiles.json',
  'launcher_profiles_microsoft_store.json',
]);

export async function packInstance(root: string, target: string, task: TaskContext) {
  const files: { name: string; size: number; mode: number; mtime: Date }[] = [];
  const directories: string[] = [];
  async function walk(prefix = '') {
    task.signal.throwIfAborted();
    for (const entry of await readdir(prefix ? inside(root, prefix) : root, {
      withFileTypes: true,
    })) {
      if (!prefix && excluded.has(entry.name)) continue;
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(tr('backups.symbolicLink', { name }));
      if (entry.isDirectory()) {
        directories.push(name);
        await walk(name);
      } else if (entry.isFile()) {
        const info = await lstat(inside(root, name));
        files.push({ name, size: info.size, mode: info.mode, mtime: info.mtime });
      }
    }
  }
  await walk();
  task.signal.throwIfAborted();
  const zip = new ZipFile();
  const stream = zip.outputStream as Readable;
  const output = pipeline(stream, createWriteStream(target), { signal: task.signal });
  zip.on('error', (error: Error) => stream.destroy(error));
  const total = files.reduce((sum, file) => sum + file.size, 0);
  let completed = 0;
  let lastReport = 0;
  let reading: ReturnType<typeof createReadStream> | undefined;
  try {
    for (const directory of directories) zip.addEmptyDirectory(directory);
    for (const file of files) {
      zip.addReadStreamLazy(file.name, { ...file, compressionLevel: 1 }, (callback) => {
        reading = createReadStream(inside(root, file.name), { signal: task.signal });
        callback(null, reading);
        reading.on('data', (chunk) => {
          completed += chunk.length;
          if (Date.now() - lastReport < 200) return;
          lastReport = Date.now();
          task.report(
            total ? (completed / total) * 95 : 0,
            tr('backups.packing', { name: file.name }),
          );
        });
      });
    }
    zip.end();
    await output;
    return files.length;
  } finally {
    reading?.destroy();
    stream.destroy();
    await output.catch(() => undefined);
  }
}

export async function unpackInstance(path: string, root: string, task: TaskContext) {
  const zip = await open(path);
  try {
    const entries = await readAllEntries(zip);
    const total = entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0);
    let completed = 0;
    for (const entry of entries) {
      task.signal.throwIfAborted();
      const name = entry.fileName;
      if (((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000)
        throw new Error(tr('backups.symbolicLink', { name }));
      if (name.endsWith('/')) {
        await mkdir(inside(root, name.slice(0, -1)), { recursive: true });
      } else {
        await extractEntry(zip, entry, root, name, task.signal);
        const target = inside(root, name);
        const modified = entry.getLastModDate();
        await utimes(target, modified, modified);
        if (process.platform !== 'win32') {
          const mode = (entry.externalFileAttributes >>> 16) & 0o777;
          if (mode) await chmod(target, mode);
        }
        completed += entry.uncompressedSize;
        task.report(total ? (completed / total) * 95 : 0, tr('backups.restoringFile', { name }));
      }
    }
  } finally {
    zip.close();
  }
}
