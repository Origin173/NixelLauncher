import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { tr } from '../shared/i18n';

export function inside(root: string, path: string) {
  if (isAbsolute(path) || path.includes('\\') || path.includes(':'))
    throw new Error(tr('files.theFilePathMustBeRelative'));
  if (
    path
      .split('/')
      .some(
        (segment) =>
          !segment ||
          segment === '.' ||
          segment === '..' ||
          /[. ]$/.test(segment) ||
          /[<>"|?*]/.test(segment) ||
          [...segment].some((character) => character.charCodeAt(0) < 32) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment),
      )
  )
    throw new Error(tr('files.theFilePathContainsAnUnsafeName'));
  const target = resolve(root, path);
  const difference = relative(resolve(root), target);
  if (
    !difference ||
    difference === '..' ||
    difference.startsWith(`..${sep}`) ||
    isAbsolute(difference)
  )
    throw new Error(tr('files.theFilePathIsOutsideTheInstance'));
  return target;
}

export async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'User-Agent': 'NixelLauncher/0.1.0', ...init?.headers },
  });
  if (!response.ok)
    throw new Error(
      tr('files.requestFailedValueValue', {
        value1: response.status,
        value2: new URL(url).hostname,
      }),
    );
  return response.json() as Promise<T>;
}

export async function download(
  url: string,
  target: string,
  signal: AbortSignal,
  hashes?: Record<string, string>,
  progress?: (current: number, total: number) => void,
) {
  if (new URL(url).protocol !== 'https:') throw new Error(tr('files.theDownloadUrlMustUseHttps'));
  const response = await fetch(url, { signal, headers: { 'User-Agent': 'NixelLauncher/0.1.0' } });
  if (!response.ok || !response.body)
    throw new Error(tr('files.downloadFailedHttpValue', { value1: response.status }));
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.part`;
  let current = 0;
  const total = Number(response.headers.get('content-length')) || 0;
  const algorithm = ['sha512', 'sha256', 'sha1', 'md5'].find((name) => hashes?.[name]);
  const digest = algorithm ? createHash(algorithm) : undefined;
  const source = Readable.fromWeb(response.body as never);
  source.on('data', (chunk: Buffer) => {
    current += chunk.length;
    digest?.update(chunk);
    progress?.(current, total);
  });
  try {
    await pipeline(source, createWriteStream(temporary), { signal });
    if (digest && algorithm && digest.digest('hex') !== hashes?.[algorithm]?.toLowerCase())
      throw new Error(tr('files.fileChecksumVerificationFailed'));
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function hashFile(path: string, algorithm = 'sha512', signal?: AbortSignal) {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(path, { signal })) hash.update(chunk);
  return hash.digest('hex');
}
