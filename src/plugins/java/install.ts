import { chmod, mkdir, readFile, rename, rm, symlink } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { tr } from '../../shared/i18n';
import { inside, json } from '../files';
import { fileValid, installFiles } from '../install-files';
import type { WorkProgress } from '../minecraft-engine';
import type { DownloadArtifact } from '../minecraft-version';
import { discoverJava, inspectJava, type JavaRuntime } from './discovery';
import { checkArtifact, checkDirectory, checkStaging, pathInfo, runtimePaths } from './manifest';

const runtimeIndex =
  'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json';
interface JavaTarget {
  version: { name: string; released: string };
  manifest: DownloadArtifact;
}
type JavaRuntimes = Record<string, Record<string, JavaTarget[]>>;
const installing = new Set<string>();

/** Retain verified files under the exact manifest identity until the whole runtime is ready. */
export async function installJava(
  root: string,
  major: number,
  progress: WorkProgress,
  concurrency = 32,
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
  root = resolve(root);
  const destination = inside(root, `java-${major}-${platform}`);
  await checkDirectory(root);
  await checkDirectory(destination);
  const existing = (await discoverJava(root, progress.signal)).find(
    (runtime) => runtime.major === major && runtime.path.startsWith(`${destination}${sep}`),
  );
  if (existing) return existing;
  if (installing.has(destination))
    throw new Error(tr('java.javaValueIsBeingInstalledWaitFor', { value1: major }));
  installing.add(destination);
  let staged = false;
  try {
    progress.signal.throwIfAborted();
    progress.update(tr('java.findMojangJavaValue', { value1: major }));
    const index = await json<JavaRuntimes>(runtimeIndex, { signal: progress.signal });
    const target = Object.values(index[platform] || {})
      .flat()
      .filter((entry) => Number(/^(\d+)/.exec(entry.version.name)?.[1]) === major)
      .sort((a, b) => b.version.released.localeCompare(a.version.released))[0];
    if (!target) throw new Error(tr('java.mojangHasNoJavaValueRuntimeFor', { value1: major }));
    checkArtifact(target.manifest);
    const staging = inside(
      root,
      `java-${major}-${platform}.installing-${target.manifest.sha1?.toLowerCase()}`,
    );
    await checkDirectory(staging);
    await mkdir(staging, { recursive: true });
    staged = true;
    const manifestPath = join(staging, '.nixel-runtime.json');
    const manifestInfo = await pathInfo(manifestPath);
    if (manifestInfo && !manifestInfo.isFile())
      throw new Error(tr('javaRecovery.unsafePath', { path: manifestPath }));
    const message = tr('java.downloadJavaValue', { value1: major });
    await installFiles([{ ...target.manifest, target: manifestPath }], progress, message, 1);
    if (!(await fileValid({ ...target.manifest, target: manifestPath }, progress.signal)))
      throw new Error(tr('javaRecovery.invalidManifest'));
    const paths = runtimePaths(staging, JSON.parse(await readFile(manifestPath, 'utf8')));
    // Reused entries are checked without following links before any download can reuse them.
    await checkStaging(staging, paths);
    const downloads = [...paths].flatMap(([name, file]) =>
      file.type === 'file' ? [{ ...file.downloads.raw, target: inside(staging, name) }] : [],
    );
    await installFiles(downloads, progress, message, concurrency);
    for (const [name, file] of paths) {
      progress.signal.throwIfAborted();
      const path = inside(staging, name);
      if (file.type === 'directory') await mkdir(path, { recursive: true });
      else if (file.type === 'file' && file.executable) await chmod(path, 0o755);
      else if (file.type === 'link' && !(await pathInfo(path))) {
        await mkdir(dirname(path), { recursive: true });
        await symlink(file.target, path);
      }
    }
    // installFiles verifies reused hashes and DownloadProvider verifies new downloads.
    // Check final layout and declared sizes without hashing the complete runtime twice.
    await checkStaging(staging, paths, true);
    progress.signal.throwIfAborted();
    const executable = process.platform === 'win32' ? 'java.exe' : 'java';
    let verified: JavaRuntime | undefined;
    for (const directory of ['bin', 'jre.bundle/Contents/Home/bin', 'Contents/Home/bin']) {
      const candidate = `${directory}/${executable}`;
      const file = paths.get(candidate);
      if (!file || file.type === 'directory') continue;
      verified = await inspectJava(inside(staging, candidate), progress.signal).catch(
        () => undefined,
      );
      if (verified) break;
    }
    if (!verified || verified.major !== major) {
      progress.signal.throwIfAborted();
      throw new Error(tr('java.theDownloadedJavaRuntimeFailedVerification'));
    }
    const relativeExecutable = verified.path.slice(staging.length + 1);
    progress.signal.throwIfAborted();
    await checkDirectory(destination);
    await rm(destination, { recursive: true, force: true });
    await rename(staging, destination);
    progress.update(tr('java.javaValueInstalled', { value1: major }), 1, 1);
    return { ...verified, path: join(destination, relativeExecutable) };
  } catch (error) {
    if (staged) progress.update(tr('javaRecovery.retained'));
    throw error;
  } finally {
    // Failures and cancellation retain complete files; DownloadProvider owns partial cleanup.
    installing.delete(destination);
  }
}
