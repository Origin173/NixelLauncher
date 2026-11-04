import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ZipFile } from 'yazl';
import type { NixelHost, TaskContext } from '../../shared/host-api';
import { tr } from '../../shared/i18n';
import { collectDiagnostics } from './collect';

export async function exportDiagnostics(
  host: NixelHost,
  id: string,
  path: string,
  task: TaskContext,
) {
  task.report(0, tr('diagnostics.collecting'));
  const report = await collectDiagnostics(host, id, task.signal);
  task.report(50, tr('diagnostics.packing'));
  const temporary = `${path}.${randomUUID()}.part`;
  const zip = new ZipFile();
  const stream = zip.outputStream as Readable;
  zip.on('error', (error: Error) => stream.destroy(error));
  const writing = pipeline(stream, createWriteStream(temporary, { flags: 'wx' }), {
    signal: task.signal,
  });
  try {
    zip.addBuffer(Buffer.from(JSON.stringify(report, null, 2)), 'report.json');
    for (const [index, source] of report.sources.entries())
      zip.addBuffer(Buffer.from(source.text), `logs/${index + 1}.txt`);
    zip.addBuffer(Buffer.from(tr('diagnostics.archiveReadme')), 'README.txt');
    zip.end();
    await writing;
    task.signal.throwIfAborted();
    await rename(temporary, path);
    task.report(100, tr('diagnostics.exported'));
    task.log(tr('diagnostics.exported'));
    for (const warning of report.warnings) task.log(warning);
  } finally {
    stream.destroy();
    await rm(temporary, { force: true });
  }
}
