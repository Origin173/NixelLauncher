import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { type DownloadProvider, downloadsId } from '../shared/downloads';
import { tr } from '../shared/i18n';
import { launcherUserAgent } from '../shared/launcher-metadata';
import { taskScope } from '../shared/task-scope';

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
    headers: { 'User-Agent': launcherUserAgent, ...init?.headers },
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
  const execution = taskScope.getStore();
  if (!execution) throw new Error(tr('downloads.taskRequired'));
  await execution.providers
    .get<DownloadProvider>('downloads', downloadsId)
    .download({ url, target, signal, hashes, progress }, execution.task);
}

export async function hashFile(path: string, algorithm = 'sha512', signal?: AbortSignal) {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(path, { signal })) hash.update(chunk);
  return hash.digest('hex');
}
