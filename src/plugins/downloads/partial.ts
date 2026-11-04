import { createHash } from 'node:crypto';
import { lstat, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { DownloadRequest } from '../../shared/downloads';
import { tr } from '../../shared/i18n';

export interface DownloadIdentity {
  key: string;
  validator?: { header: 'etag' | 'last-modified'; value: string };
  total?: number;
}
export function partialPaths(cache: string, target: string) {
  const path = resolve(target);
  const key = createHash('sha256')
    .update(process.platform === 'win32' ? path.toLowerCase() : path)
    .digest('hex');
  return { data: join(cache, `${key}.part`), metadata: join(cache, `${key}.json`) };
}
export function requestIdentity(request: DownloadRequest) {
  return createHash('sha256')
    .update(JSON.stringify([request.url, Object.entries(request.hashes ?? {}).sort()]))
    .digest('hex');
}
export async function discardPartial(paths: ReturnType<typeof partialPaths>) {
  await Promise.all([rm(paths.data, { force: true }), rm(paths.metadata, { force: true })]);
}
export async function readPartial(paths: ReturnType<typeof partialPaths>, key: string) {
  try {
    const [info, metadataInfo] = await Promise.all([lstat(paths.data), lstat(paths.metadata)]);
    if (!info.isFile() || !metadataInfo.isFile() || metadataInfo.size > 4096)
      throw new Error(tr('downloads.invalidPartial'));
    const metadata = JSON.parse(await readFile(paths.metadata, 'utf8')) as DownloadIdentity;
    if (
      !metadata ||
      metadata.key !== key ||
      !metadata.validator ||
      !['etag', 'last-modified'].includes(metadata.validator.header) ||
      typeof metadata.validator.value !== 'string' ||
      !metadata.validator.value ||
      /[\r\n]/.test(metadata.validator.value) ||
      (metadata.validator.header === 'etag' && !/^"[^"\r\n]*"$/.test(metadata.validator.value)) ||
      (metadata.validator.header === 'last-modified' &&
        !Number.isFinite(Date.parse(metadata.validator.value))) ||
      (metadata.total !== undefined &&
        (!Number.isSafeInteger(metadata.total) || metadata.total < info.size))
    )
      return undefined;
    return { metadata, offset: info.size };
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
export async function saveIdentity(
  paths: ReturnType<typeof partialPaths>,
  identity: DownloadIdentity,
) {
  // A URL digest binds the partial to the request without persisting signed query parameters.
  await writeFile(paths.metadata, JSON.stringify(identity), 'utf8');
}
