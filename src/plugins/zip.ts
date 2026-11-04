import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yauzl, { type Entry, type ZipFile } from 'yauzl';
import { tr } from '../shared/i18n';
import { inside } from './files';

export function open(path: string, options: yauzl.Options = {}) {
  return new Promise<ZipFile>((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true, autoClose: false, ...options }, (error, zip) => {
      if (error) reject(error);
      else resolve(zip);
    });
  });
}

export function readAllEntries(zip: ZipFile) {
  return new Promise<Entry[]>((resolve, reject) => {
    const entries: Entry[] = [];
    const cleanup = () => {
      zip.off('entry', entry);
      zip.off('end', end);
      zip.off('error', error);
    };
    const error = (error: Error) => {
      cleanup();
      reject(error);
    };
    const end = () => {
      cleanup();
      resolve(entries);
    };
    const entry = (entry: Entry) => {
      entries.push(entry);
      zip.readEntry();
    };
    zip.on('entry', entry).once('end', end).once('error', error);
    zip.readEntry();
  });
}

export function openEntryReadStream(zip: ZipFile, entry: Entry) {
  return new Promise<Readable>((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error) reject(error);
      else resolve(stream);
    });
  });
}

export async function readEntry(zip: ZipFile, entry: Entry) {
  const chunks: Buffer[] = [];
  for await (const chunk of await openEntryReadStream(zip, entry)) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export async function extractEntry(
  zip: ZipFile,
  entry: Entry,
  root: string,
  path: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000)
    throw new Error(tr('modpacks.modpacksCannotContainSymbolicLinks'));
  const target = inside(root, path);
  await mkdir(dirname(target), { recursive: true });
  await pipeline(await openEntryReadStream(zip, entry), createWriteStream(target), { signal });
}
