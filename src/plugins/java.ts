import { execFile } from 'node:child_process';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, dirname, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { tr } from '../shared/i18n';
import { inside, json } from './files';
import { installFiles } from './install-files';
import type { WorkProgress } from './minecraft-engine';
import type { DownloadArtifact } from './minecraft-version';

const runtimeIndex =
  'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json';
interface JavaTarget {
  version: { name: string; released: string };
  manifest: DownloadArtifact;
}
type JavaRuntimes = Record<string, Record<string, JavaTarget[]>>;
type RuntimeFile =
  | { type: 'directory' }
  | { type: 'link'; target: string }
  | {
      type: 'file';
      executable?: boolean;
      downloads: { raw: DownloadArtifact };
    };

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

const installing = new Set<string>();

/** Install the official runtime manifest and raw files, preserving executable bits and links. */
export async function installJava(
  root: string,
  major: number,
  progress: WorkProgress,
  concurrency = 8,
) {
  if (!Number.isInteger(major) || major < 8)
    throw new Error(tr('java.chooseAValidJavaMajorVersion'));
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
  if (!platform) throw new Error(tr('java.mojangHasNoJavaRuntimeForThis'));
  const destination = inside(resolve(root), `java-${major}-${platform}`);
  const existing = (await discoverJava(root, progress.signal)).find(
    (runtime) => runtime.major === major && runtime.path.startsWith(`${destination}${sep}`),
  );
  if (existing) return existing;
  if (installing.has(destination))
    throw new Error(tr('java.javaValueIsBeingInstalledWaitFor', { value1: major }));
  installing.add(destination);
  let staging: string | undefined;
  try {
    progress.signal.throwIfAborted();
    progress.update(tr('java.findMojangJavaValue', { value1: major }));
    const index = await json<JavaRuntimes>(runtimeIndex, { signal: progress.signal });
    const targets = index[platform as keyof JavaRuntimes];
    const target = Object.values(targets || {})
      .flat()
      .filter((entry) => Number(/^(\d+)/.exec(entry.version.name)?.[1]) === major)
      .sort((a, b) => b.version.released.localeCompare(a.version.released))[0];
    if (!target) throw new Error(tr('java.mojangHasNoJavaValueRuntimeFor', { value1: major }));
    await mkdir(root, { recursive: true });
    staging = await mkdtemp(inside(resolve(root), `java-${major}-${platform}.installing-`));
    const manifestPath = join(staging, '.nixel-runtime.json');
    const message = tr('java.downloadJavaValue', { value1: major });
    await installFiles([{ ...target.manifest, target: manifestPath }], progress, message, 1);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      files: Record<string, RuntimeFile>;
    };
    const files = Object.entries(manifest.files);
    // Resolve all paths before writing any runtime file.
    for (const [name, file] of files) {
      const path = inside(staging, name);
      if (file.type === 'link')
        inside(
          staging,
          relative(staging, resolve(dirname(path), file.target)).replaceAll('\\', '/'),
        );
    }
    await installFiles(
      files.flatMap(([name, file]) =>
        file.type === 'file'
          ? [{ ...file.downloads.raw, target: inside(staging as string, name) }]
          : [],
      ),
      progress,
      message,
      concurrency,
    );
    for (const [name, file] of files) {
      progress.signal.throwIfAborted();
      const path = inside(staging, name);
      if (file.type === 'directory') await mkdir(path, { recursive: true });
      else if (file.type === 'file' && file.executable) await chmod(path, 0o755);
      else if (file.type === 'link') {
        await mkdir(dirname(path), { recursive: true });
        await symlink(file.target, path);
      }
    }
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
    if (!verified || verified.major !== major)
      throw new Error(tr('java.theDownloadedJavaRuntimeFailedVerification'));
    const relativeExecutable = verified.path.slice(staging.length + 1);
    progress.signal.throwIfAborted();
    // Both paths were resolved and checked within the managed root before recursive removal.
    const destinationInfo = await lstat(destination).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
      return undefined;
    });
    if (destinationInfo && (!destinationInfo.isDirectory() || destinationInfo.isSymbolicLink()))
      throw new Error(tr('java.theJavaInstallationPathIsNotA'));
    await rm(destination, { recursive: true, force: true });
    await rename(staging, destination);
    progress.update(tr('java.javaValueInstalled', { value1: major }), 1, 1);
    return { ...verified, path: join(destination, relativeExecutable) };
  } finally {
    installing.delete(destination);
    if (staging) await rm(staging, { recursive: true, force: true });
  }
}
