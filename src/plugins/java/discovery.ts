import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { promisify } from 'node:util';
import { tr } from '../../shared/i18n';

const execute = promisify(execFile);
export interface JavaRuntime {
  path: string;
  version: string;
  major: number;
  vendor: string;
}

export async function inspectJava(path: string, signal?: AbortSignal): Promise<JavaRuntime> {
  const { stderr, stdout } = await execute(path, ['-XshowSettings:properties', '-version'], {
    windowsHide: true,
    timeout: 10000,
    signal,
  });
  const output = `${stderr}\n${stdout}`;
  const version = /(?:java.version\s*=\s*|version ")([^\s"]+)/.exec(output)?.[1];
  if (!version) throw new Error(tr('java.couldNotDetectTheJavaVersion'));
  const parts = version.split('.');
  return {
    path,
    version,
    major: Number(parts[0] === '1' ? parts[1] : parts[0]),
    vendor: /java.vendor\s*=\s*(.+)/.exec(output)?.[1]?.trim() || 'Java',
  };
}

export async function discoverJava(
  managedRoot?: string,
  signal?: AbortSignal,
): Promise<JavaRuntime[]> {
  const executable = process.platform === 'win32' ? 'java.exe' : 'java';
  const paths = new Set<string>();
  for (const directory of (process.env.PATH || '').split(delimiter))
    if (directory) paths.add(join(directory, executable));
  if (process.env.JAVA_HOME) paths.add(join(process.env.JAVA_HOME, 'bin', executable));
  const roots =
    process.platform === 'win32'
      ? [
          'C:/Program Files/Java',
          'C:/Program Files/Eclipse Adoptium',
          'C:/Program Files/Microsoft',
          'C:/Program Files/Amazon Corretto',
          'C:/Program Files/BellSoft',
          join(homedir(), '.jdks'),
        ]
      : process.platform === 'darwin'
        ? ['/Library/Java/JavaVirtualMachines', join(homedir(), 'Library/Java/JavaVirtualMachines')]
        : ['/usr/lib/jvm', '/usr/java'];
  if (managedRoot) roots.push(managedRoot);
  for (const root of roots) {
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const entry of entries)
      if (entry.isDirectory() && !entry.name.includes('.installing')) {
        paths.add(join(root, entry.name, 'bin', executable));
        if (process.platform === 'darwin')
          for (const home of ['Contents/Home', 'jre.bundle/Contents/Home'])
            paths.add(join(root, entry.name, home, 'bin/java'));
      }
  }
  signal?.throwIfAborted();
  const results = await Promise.allSettled([...paths].map((path) => inspectJava(path, signal)));
  signal?.throwIfAborted();
  return results
    .flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
    .sort((a, b) => b.major - a.major);
}
