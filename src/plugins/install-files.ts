import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { errorMessage } from '../shared/error-message';
import { tr } from '../shared/i18n';
import { download, hashFile } from './files';
import type { WorkProgress } from './minecraft-engine';
import type { DownloadArtifact } from './minecraft-version';

export interface InstallFile extends DownloadArtifact {
  target: string;
}
export async function fileValid(file: InstallFile, signal: AbortSignal) {
  const info = await stat(file.target).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
    return undefined;
  });
  if (!info?.isFile() || (file.size !== undefined && info.size !== file.size)) return false;
  return !file.sha1 || (await hashFile(file.target, 'sha1', signal)) === file.sha1.toLowerCase();
}

export async function installFiles(
  files: InstallFile[],
  progress: WorkProgress,
  message: string,
  concurrency = 8,
) {
  const queue = [...new Map(files.map((file) => [file.target, file])).values()];
  let next = 0;
  let completed = 0;
  const active = new Map<string, number>();
  let lastReport = 0;
  const controller = new AbortController();
  const signal = AbortSignal.any([progress.signal, controller.signal]);
  let failure: unknown;
  progress.update(message, 0, queue.length);
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    try {
      while (next < queue.length) {
        signal.throwIfAborted();
        const file = queue[next++];
        if (!file) break;
        if (!(await fileValid(file, signal))) {
          if (!file.url) throw new Error(tr('engine.generatedFileMissing', { path: file.target }));
          await download(
            file.url.replace(/^http:/, 'https:'),
            file.target,
            signal,
            file.sha1 ? { sha1: file.sha1 } : undefined,
            (current, total) => {
              active.set(file.target, total ? current / total : 0);
              if (Date.now() - lastReport >= 200) {
                progress.update(
                  message,
                  completed + [...active.values()].reduce((sum, value) => sum + value, 0),
                  queue.length,
                );
                lastReport = Date.now();
              }
            },
          ).catch((error: unknown) => {
            signal.throwIfAborted();
            throw new Error(
              tr('engine.downloadFileFailed', {
                name: basename(file.target),
                message: errorMessage(error),
              }),
              { cause: error },
            );
          });
        }
        active.delete(file.target);
        progress.update(message, ++completed, queue.length);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        failure = error;
        controller.abort(error);
      }
    }
  });
  await Promise.all(workers);
  if (failure) throw failure;
  progress.signal.throwIfAborted();
}
