import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DownloadRequest } from '../../shared/downloads';
import { errorMessage } from '../../shared/error-message';
import { tr } from '../../shared/i18n';
import {
  type DownloadIdentity,
  discardPartial,
  partialPaths,
  readPartial,
  requestIdentity,
  saveIdentity,
} from './partial';
import type { DownloadRateLimit } from './rate-limit';

function validator(response: Response): DownloadIdentity['validator'] {
  const etag = response.headers.get('etag');
  if (etag && /^"[^"\r\n]*"$/.test(etag)) return { header: 'etag', value: etag };
  const modified = response.headers.get('last-modified');
  const date = response.headers.get('date');
  if (modified && date && Date.parse(date) - Date.parse(modified) >= 60000)
    return { header: 'last-modified', value: modified };
  return undefined;
}

export async function transferDownload(
  request: DownloadRequest,
  cache: string,
  rate: DownloadRateLimit,
  log: (message: string) => void,
) {
  const { url, target, signal, hashes, progress } = request;
  if (new URL(url).protocol !== 'https:') throw new Error(tr('files.theDownloadUrlMustUseHttps'));
  await mkdir(cache, { recursive: true });
  const paths = partialPaths(cache, target);
  const key = requestIdentity(request);
  const partial = await readPartial(paths, key);
  let offset = partial?.offset ?? 0;
  let identity: DownloadIdentity = partial?.metadata ?? { key };
  if (!partial) await discardPartial(paths);
  if (offset) log(tr('downloads.resumingBytes', { bytes: offset }));
  const algorithm = ['sha512', 'sha256', 'sha1', 'md5'].find((name) => hashes?.[name]);
  async function finish() {
    if (algorithm) {
      const hash = createHash(algorithm);
      for await (const chunk of createReadStream(paths.data, { signal })) hash.update(chunk);
      if (hash.digest('hex') !== hashes?.[algorithm]?.toLowerCase()) {
        await discardPartial(paths);
        throw new Error(tr('files.fileChecksumVerificationFailed'));
      }
    }
    signal.throwIfAborted();
    await mkdir(dirname(target), { recursive: true });
    try {
      await rename(paths.data, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
      // Custom instance folders can live on another volume; commit beside the target.
      const staging = `${target}.${randomUUID()}.part`;
      try {
        await copyFile(paths.data, staging);
        signal.throwIfAborted();
        await rename(staging, target);
      } catch (error) {
        await rm(staging, { force: true });
        throw error;
      }
    }
    try {
      await discardPartial(paths);
    } catch (error) {
      log(tr('downloads.cleanupFailed', { message: errorMessage(error) }));
    }
  }
  let restarted = false;
  while (true) {
    signal.throwIfAborted();
    const headers: Record<string, string> = {
      'User-Agent': 'NixelLauncher/0.1.0',
      'Accept-Encoding': 'identity',
    };
    if (offset && identity.validator) {
      headers.Range = `bytes=${offset}-`;
      headers['If-Range'] = identity.validator.value;
    }
    const response = await fetch(url, { signal, headers });
    if (response.status === 416 && offset) {
      await response.body?.cancel();
      const total = /^bytes \*\/(\d+)$/.exec(response.headers.get('content-range') ?? '')?.[1];
      if (algorithm && Number(total) === offset && identity.total === offset) {
        await finish();
        progress?.(offset, offset);
        return;
      }
      await discardPartial(paths);
      log(tr('downloads.restartRange'));
      if (restarted) throw new Error(tr('downloads.invalidRange'));
      offset = 0;
      identity = { key };
      restarted = true;
      continue;
    }
    if ((response.status !== 200 && response.status !== 206) || !response.body) {
      await response.body?.cancel();
      throw new Error(tr('files.downloadFailedHttpValue', { value1: response.status }));
    }
    const encoding = response.headers.get('content-encoding');
    let total: number | undefined;
    let expected: number | undefined;
    const length = response.headers.get('content-length');
    if (length !== null) expected = /^\d+$/.test(length) ? Number(length) : Number.NaN;
    const currentValidator = validator(response);
    if (response.status === 206) {
      const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') ?? '');
      const start = Number(range?.[1]);
      const end = Number(range?.[2]);
      total = Number(range?.[3]);
      if (
        !offset ||
        !range ||
        start !== offset ||
        end < start ||
        end >= total ||
        !Number.isSafeInteger(total) ||
        (expected !== undefined && expected !== end - start + 1) ||
        !identity.validator ||
        response.headers.get(identity.validator.header) !== identity.validator.value ||
        (identity.total !== undefined && identity.total !== total)
      ) {
        await response.body.cancel();
        await discardPartial(paths);
        throw new Error(tr('downloads.invalidRange'));
      }
      expected = end - start + 1;
    } else {
      // A server ignoring Range or returning a changed If-Range representation sends a full body.
      if (offset) log(tr('downloads.restartRange'));
      offset = 0;
      total = expected;
    }
    if (
      (encoding && encoding !== 'identity') ||
      (expected !== undefined && (!Number.isSafeInteger(expected) || expected < 0))
    ) {
      await response.body.cancel();
      await discardPartial(paths);
      throw new Error(tr('downloads.invalidRange'));
    }
    identity = { key, validator: currentValidator, total };
    // Opening before writing metadata also truncates a discarded/changed representation.
    const output = await open(paths.data, offset ? 'a' : 'w');
    let received = 0;
    try {
      await saveIdentity(paths, identity);
      progress?.(offset, total ?? 0);
      for await (const chunk of response.body) {
        const buffer = Buffer.from(chunk);
        await rate.consume(buffer.length, signal);
        signal.throwIfAborted();
        await output.writeFile(buffer);
        received += buffer.length;
        progress?.(offset + received, total ?? 0);
      }
    } finally {
      await output.close();
    }
    if (expected !== undefined && received !== expected)
      throw new Error(tr('downloads.incomplete'));
    offset += received;
    if (total !== undefined && offset < total) continue;
    await finish();
    progress?.(offset, total ?? offset);
    return;
  }
}
