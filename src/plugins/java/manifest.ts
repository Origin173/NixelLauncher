import { lstat, readdir, readlink } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { tr } from '../../shared/i18n';
import { inside } from '../files';
import type { DownloadArtifact } from '../minecraft-version';

export type RuntimeFile =
  | { type: 'directory' }
  | { type: 'link'; target: string }
  | { type: 'file'; executable?: boolean; downloads: { raw: DownloadArtifact } };

export async function pathInfo(path: string) {
  return lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
    return undefined;
  });
}

export async function checkDirectory(path: string) {
  const info = await pathInfo(path);
  if (info && (!info.isDirectory() || info.isSymbolicLink()))
    throw new Error(tr('javaRecovery.unsafePath', { path }));
}

export function checkArtifact(artifact: DownloadArtifact) {
  if (
    !artifact ||
    typeof artifact.url !== 'string' ||
    !/^https:\/\//.test(artifact.url) ||
    typeof artifact.sha1 !== 'string' ||
    !/^[a-f0-9]{40}$/i.test(artifact.sha1) ||
    !Number.isSafeInteger(artifact.size) ||
    (artifact.size as number) < 0
  )
    throw new Error(tr('javaRecovery.invalidManifest'));
}

/** Include implicit directories so every persisted entry can be checked without following links. */
export function runtimePaths(staging: string, value: unknown) {
  if (
    !value ||
    typeof value !== 'object' ||
    !('files' in value) ||
    !value.files ||
    typeof value.files !== 'object' ||
    Array.isArray(value.files)
  )
    throw new Error(tr('javaRecovery.invalidManifest'));
  const expected = new Map<string, RuntimeFile>();
  const names = new Set<string>();
  for (const [name, file] of Object.entries(value.files) as [string, RuntimeFile][]) {
    const path = inside(staging, name);
    const key = process.platform === 'win32' ? name.toLowerCase() : name;
    if (key === '.nixel-runtime.json' || key.startsWith('.nixel-runtime.json/') || names.has(key))
      throw new Error(tr('javaRecovery.invalidManifest'));
    names.add(key);
    if (!file || !['directory', 'file', 'link'].includes(file.type))
      throw new Error(tr('javaRecovery.invalidManifest'));
    if (file.type === 'file') checkArtifact(file.downloads?.raw);
    if (file.type === 'link') {
      if (typeof file.target !== 'string' || !file.target || isAbsolute(file.target))
        throw new Error(tr('javaRecovery.invalidManifest'));
      inside(staging, relative(staging, resolve(dirname(path), file.target)).replaceAll('\\', '/'));
    }
    expected.set(name, file);
  }
  for (const name of [...expected.keys()]) {
    for (
      let parent = dirname(name).replaceAll('\\', '/');
      parent !== '.';
      parent = dirname(parent).replaceAll('\\', '/')
    ) {
      const entry = expected.get(parent);
      if (entry && entry.type !== 'directory') throw new Error(tr('javaRecovery.invalidManifest'));
      expected.set(parent, { type: 'directory' });
    }
  }
  const canonical = new Set<string>();
  for (const [name, file] of expected) {
    const key = process.platform === 'win32' ? name.toLowerCase() : name;
    if (canonical.has(key)) throw new Error(tr('javaRecovery.invalidManifest'));
    canonical.add(key);
    if (file.type === 'link') {
      const target = relative(
        staging,
        resolve(dirname(inside(staging, name)), file.target),
      ).replaceAll('\\', '/');
      if (!expected.has(target)) throw new Error(tr('javaRecovery.invalidManifest'));
    }
  }
  return expected;
}

export async function checkStaging(
  staging: string,
  expected: Map<string, RuntimeFile>,
  complete = false,
) {
  await checkDirectory(staging);
  const found = new Set<string>();
  async function walk(prefix = '') {
    const directory = prefix ? inside(staging, prefix) : staging;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      const path = inside(staging, name);
      const file = expected.get(name);
      if (name === '.nixel-runtime.json' && entry.isFile()) continue;
      if (
        !file ||
        (file.type === 'directory' && !entry.isDirectory()) ||
        (file.type === 'file' && !entry.isFile()) ||
        (file.type === 'link' &&
          (!entry.isSymbolicLink() || (await readlink(path)) !== file.target))
      )
        throw new Error(tr('javaRecovery.unsafePath', { path }));
      found.add(name);
      if (complete && file.type === 'file' && (await lstat(path)).size !== file.downloads.raw.size)
        throw new Error(tr('java.theDownloadedJavaRuntimeFailedVerification'));
      if (entry.isDirectory()) await walk(name);
    }
  }
  await walk();
  if (complete && [...expected.keys()].some((name) => !found.has(name)))
    throw new Error(tr('java.theDownloadedJavaRuntimeFailedVerification'));
}
