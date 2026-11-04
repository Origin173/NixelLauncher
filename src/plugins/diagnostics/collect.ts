import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import type { DiagnosticReport, DiagnosticSource } from '../../shared/diagnostics';
import type { NixelHost } from '../../shared/host-api';
import { tr } from '../../shared/i18n';
import { getInstance } from '../instance-state';
import { analyzeDiagnostics } from './analyze';
import { diagnosticRedactor } from './privacy';

const maxBytes = 1024 * 1024;

export async function collectDiagnostics(
  host: NixelHost,
  id: string,
  signal?: AbortSignal,
): Promise<DiagnosticReport> {
  const instance = structuredClone(getInstance(host, id));
  const redact = await diagnosticRedactor(host, instance.directory);
  const root = await realpath(instance.directory);
  const sources: DiagnosticSource[] = [];
  const warnings: string[] = [];
  async function boundedPath(name: string) {
    const path = join(root, name);
    const resolved = await realpath(path);
    const difference = relative(root, resolved);
    if (
      isAbsolute(difference) ||
      difference === '..' ||
      difference.startsWith(`..${sep}`) ||
      (await lstat(path)).isSymbolicLink()
    )
      throw new Error(tr('diagnostics.unsafePath', { name: redact(name) }));
    return path;
  }
  async function read(name: string) {
    signal?.throwIfAborted();
    try {
      const path = await boundedPath(name);
      const handle = await open(path, 'r');
      try {
        const info = await handle.stat();
        if (!info.isFile()) throw new Error(tr('diagnostics.notFile', { name: redact(name) }));
        const buffer = Buffer.alloc(Math.min(info.size, maxBytes));
        const { bytesRead } = await handle.read(
          buffer,
          0,
          buffer.length,
          Math.max(0, info.size - maxBytes),
        );
        let text = buffer.subarray(0, bytesRead).toString('utf8');
        const truncated = info.size > maxBytes;
        if (truncated) text = text.slice(text.indexOf('\n') + 1);
        sources.push({
          name: redact(name),
          modifiedAt: info.mtime.toISOString(),
          text: redact(text),
          truncated,
        });
      } finally {
        await handle.close();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        warnings.push(
          redact(
            tr('diagnostics.readFailed', {
              name,
              error: error instanceof Error ? error.message : String(error),
            }),
          ),
        );
    }
  }
  async function newest(directory: string, pattern: RegExp, limit: number) {
    try {
      const path = directory ? await boundedPath(directory) : root;
      const entries = await readdir(path, { withFileTypes: true });
      const files = await Promise.all(
        entries
          .filter((entry) => entry.isFile() && pattern.test(entry.name))
          .map(async (entry) => {
            const name = directory ? `${directory}/${entry.name}` : entry.name;
            return { name, modified: (await lstat(join(root, name))).mtimeMs };
          }),
      );
      for (const entry of files.sort((a, b) => b.modified - a.modified).slice(0, limit))
        await read(entry.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        warnings.push(
          redact(
            tr('diagnostics.readFailed', {
              name: directory || '.',
              error: error instanceof Error ? error.message : String(error),
            }),
          ),
        );
    }
  }
  await read('nixel-launch.log');
  await read('logs/latest.log');
  await newest('crash-reports', /^crash-.*\.txt$/i, 3);
  await newest('', /^hs_err_pid\d+\.log$/i, 1);
  const launch = host.tasks
    .list()
    .filter((task) => task.instanceId === id && (task.kind === 'launch' || task.kind === 'game'))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (launch?.status === 'failed') {
    const text = [launch.error, ...launch.logs].filter(Boolean).join('\n');
    sources.push({
      name: 'launcher-task.txt',
      modifiedAt: launch.finishedAt || launch.createdAt,
      text: redact(text.slice(-maxBytes)),
      truncated: text.length > maxBytes,
    });
  }
  signal?.throwIfAborted();
  // This whitelist deliberately excludes paths, launch arguments, provider config and accounts.
  const content = host.store
    .read()
    .content.filter((entry) => entry.instance === id)
    .map((entry) => ({
      name: redact(entry.name),
      version: redact(entry.version),
      fileName: redact(entry.fileName),
      enabled: entry.enabled,
      source: entry.source ? redact(entry.source) : undefined,
      projectId: entry.projectId ? redact(entry.projectId) : undefined,
      versionId: entry.versionId ? redact(entry.versionId) : undefined,
    }));
  return {
    createdAt: new Date().toISOString(),
    instance: {
      name: redact(instance.name),
      version: redact(instance.version),
      loader: instance.loader,
      loaderVersion: instance.loaderVersion ? redact(instance.loaderVersion) : undefined,
      memory: instance.memory ?? host.store.read().settings.memory,
    },
    content,
    sources,
    warnings,
    findings: analyzeDiagnostics(
      sources,
      content.filter((entry) => entry.enabled).map((entry) => entry.fileName),
    ),
  };
}
