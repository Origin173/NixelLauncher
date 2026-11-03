import { execFile } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import {
  createDefaultNodeInstallRuntime,
  createJavaRuntimeInstallWorkflow,
  DEFAULT_RUNTIME_ALL_URL,
  executeInstallWorkflow,
  type JavaRuntimes,
  ProgressTrackerMultiple,
} from '@xmcl/installer';
import { inside, json } from './files';
import type { WorkProgress } from './minecraft-engine';

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
  if (!version) throw new Error('无法识别 Java 版本');
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

const installing = new Set<string>();

/** Mojang's runtime workflow validates the manifest and every runtime file by SHA-1. */
export async function installJava(
  root: string,
  major: number,
  progress: WorkProgress,
  concurrency = 8,
) {
  if (!Number.isInteger(major) || major < 8) throw new Error('请选择有效的 Java 主版本');
  const platform =
    process.platform === 'win32'
      ? `windows-${process.arch === 'ia32' ? 'x86' : process.arch === 'arm64' ? 'arm64' : 'x64'}`
      : process.platform === 'darwin'
        ? `mac-os${process.arch === 'arm64' ? '-arm64' : ''}`
        : process.platform === 'linux' && process.arch === 'x64'
          ? 'linux'
          : process.platform === 'linux' && process.arch === 'ia32'
            ? 'linux-i386'
            : '';
  if (!platform) throw new Error('Mojang 尚未提供适用于当前系统架构的 Java，请手动安装');
  const destination = inside(resolve(root), `java-${major}-${platform}`);
  const existing = (await discoverJava(root, progress.signal)).find(
    (runtime) => runtime.major === major && runtime.path.startsWith(`${destination}${sep}`),
  );
  if (existing) return existing;
  if (installing.has(destination)) throw new Error(`Java ${major} 正在安装，请等待该任务完成`);
  installing.add(destination);
  let staging: string | undefined;
  const tracker = new ProgressTrackerMultiple();
  const timer = setInterval(
    () => progress.update(`下载 Java ${major}`, tracker.progress, tracker.total),
    250,
  );
  try {
    progress.signal.throwIfAborted();
    progress.update(`查询 Mojang Java ${major}`);
    const index = await json<JavaRuntimes>(DEFAULT_RUNTIME_ALL_URL, { signal: progress.signal });
    const targets = index[platform as keyof JavaRuntimes];
    const target = Object.values(targets || {})
      .flat()
      .filter((entry) => Number(/^(\d+)/.exec(entry.version.name)?.[1]) === major)
      .sort((a, b) => b.version.released.localeCompare(a.version.released))[0];
    if (!target) throw new Error(`Mojang 未提供此平台的 Java ${major}，请手动指定 Java`);
    await mkdir(root, { recursive: true });
    staging = await mkdtemp(inside(resolve(root), `java-${major}-${platform}.installing-`));
    await executeInstallWorkflow(
      createJavaRuntimeInstallWorkflow({ target, destination: staging }),
      createDefaultNodeInstallRuntime({
        signal: progress.signal,
        tracker,
        maxConcurrency: concurrency,
      }),
      { signal: progress.signal },
    );
    progress.signal.throwIfAborted();
    // Staging directories are excluded from normal discovery; inspect its known layouts directly.
    const executable = process.platform === 'win32' ? 'java.exe' : 'java';
    const candidates = ['bin', 'jre.bundle/Contents/Home/bin', 'Contents/Home/bin'];
    let verified: JavaRuntime | undefined;
    for (const directory of candidates) {
      verified = await inspectJava(join(staging, directory, executable), progress.signal).catch(
        () => undefined,
      );
      if (verified) break;
    }
    if (!verified || verified.major !== major) throw new Error('下载的 Java 运行时验证失败');
    const relativeExecutable = verified.path.slice(staging.length + 1);
    progress.signal.throwIfAborted();
    // Both paths were resolved and checked within the managed root before recursive removal.
    const destinationInfo = await lstat(destination).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
      return undefined;
    });
    if (destinationInfo && (!destinationInfo.isDirectory() || destinationInfo.isSymbolicLink()))
      throw new Error('Java 安装目录不是普通目录，请手动检查');
    await rm(destination, { recursive: true, force: true });
    await rename(staging, destination);
    progress.update(`Java ${major} 安装完成`, 1, 1);
    return { ...verified, path: join(destination, relativeExecutable) };
  } finally {
    clearInterval(timer);
    installing.delete(destination);
    if (staging) await rm(staging, { recursive: true, force: true });
  }
}
