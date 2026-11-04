import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { delimiter, dirname, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { tr } from '../shared/i18n';
import { inside } from './files';
import { fileValid, installFiles } from './install-files';
import type { InstallInput, WorkProgress } from './minecraft-engine';
import {
  type Library,
  libraryArtifacts,
  type MinecraftVersion,
  mavenPath,
} from './minecraft-version';
import { extractEntry, open, readAllEntries, readEntry } from './zip';

interface InstallProfile {
  json?: string;
  versionInfo?: MinecraftVersion;
  install?: { path: string; filePath: string };
  libraries?: Library[];
  data?: Record<string, { client: string }>;
  processors?: {
    sides?: string[];
    jar: string;
    classpath: string[];
    args: string[];
    outputs?: Record<string, string>;
  }[];
}
const execute = promisify(execFile);

export async function installForge(
  input: InstallInput & { loaderVersion: string },
  progress: WorkProgress,
) {
  const root = resolve(input.directory);
  const neo = input.loader === 'neoforge';
  const project = neo && input.minecraft !== '1.20.1' ? 'neoforge' : 'forge';
  const artifact =
    neo || input.loaderVersion.startsWith(`${input.minecraft}-`)
      ? input.loaderVersion
      : `${input.minecraft}-${input.loaderVersion}`;
  const repository = neo
    ? 'https://maven.neoforged.net/releases/'
    : 'https://maven.minecraftforge.net/';
  const coordinate = `net.${neo ? 'neoforged' : 'minecraftforge'}:${project}:${artifact}:installer`;
  const url = `${repository}${mavenPath(coordinate)}`;
  const checksum = await fetch(`${url}.sha1`, { signal: progress.signal });
  if (!checksum.ok)
    throw new Error(
      tr('files.requestFailedValueValue', {
        value1: checksum.status,
        value2: new URL(url).hostname,
      }),
    );
  const sha1 = (await checksum.text()).trim().split(/\s+/)[0];
  if (!sha1 || !/^[a-f\d]{40}$/i.test(sha1))
    throw new Error(tr('files.fileChecksumVerificationFailed'));
  const installer = inside(join(root, 'libraries'), mavenPath(coordinate));
  await installFiles(
    [{ url, sha1, target: installer }],
    progress,
    tr('engine.downloadInstaller'),
    1,
  );
  const zip = await open(installer);
  const workRoot = inside(root, '.nixel');
  await mkdir(workRoot, { recursive: true });
  const temporary = await mkdtemp(join(workRoot, 'forge-'));
  try {
    const entries = await readAllEntries(zip);
    const requiredEntry = (path: string) => {
      const entry = entries.find((entry) => entry.fileName === path.replace(/^\//, ''));
      if (!entry) throw new Error(tr('engine.archiveEntryMissing', { path }));
      return entry;
    };
    const profile = JSON.parse(
      (await readEntry(zip, requiredEntry('install_profile.json'))).toString('utf8'),
    ) as InstallProfile;
    const version =
      profile.versionInfo ??
      (JSON.parse(
        (await readEntry(zip, requiredEntry(profile.json ?? 'version.json'))).toString('utf8'),
      ) as MinecraftVersion);
    // Embedded Maven artifacts are used by both legacy installers and modern processors.
    for (const entry of entries)
      if (entry.fileName.startsWith('maven/') && !entry.fileName.endsWith('/'))
        await extractEntry(
          zip,
          entry,
          join(root, 'libraries'),
          entry.fileName.slice(6),
          progress.signal,
        );
    if (profile.install)
      await extractEntry(
        zip,
        requiredEntry(profile.install.filePath),
        join(root, 'libraries'),
        mavenPath(profile.install.path),
        progress.signal,
      );
    await installFiles(
      libraryArtifacts(profile.libraries ?? [], root),
      progress,
      tr('engine.installProcessorLibraries'),
      input.concurrency,
    );
    const data: Record<string, string> = {
      SIDE: 'client',
      ROOT: root,
      INSTALLER: installer,
      MINECRAFT_VERSION: input.minecraft,
      MINECRAFT_JAR: inside(root, `versions/${input.minecraft}/${input.minecraft}.jar`),
      LIBRARY_DIR: join(root, 'libraries'),
    };
    const artifactPath = (notation: string) => inside(join(root, 'libraries'), mavenPath(notation));
    for (const [key, { client }] of Object.entries(profile.data ?? {})) {
      if (client.startsWith('[') && client.endsWith(']'))
        data[key] = artifactPath(client.slice(1, -1));
      else if (client.startsWith("'") && client.endsWith("'")) data[key] = client.slice(1, -1);
      else {
        const name = client.replace(/^\//, '');
        await extractEntry(zip, requiredEntry(name), temporary, name, progress.signal);
        data[key] = inside(temporary, name);
      }
    }
    const expand = (value: string) => {
      if (value.startsWith('[') && value.endsWith(']')) return artifactPath(value.slice(1, -1));
      return value.replace(/\{([^}]+)\}/g, (_, key: string) => {
        const value = data[key];
        if (value === undefined) throw new Error(tr('engine.unknownVariable', { name: key }));
        return value;
      });
    };
    const processors = (profile.processors ?? []).filter(
      (processor) => !processor.sides || processor.sides.includes('client'),
    );
    for (const [index, processor] of processors.entries()) {
      progress.signal.throwIfAborted();
      progress.update(
        tr('engine.runProcessor', { current: index + 1, total: processors.length }),
        index,
        processors.length,
      );
      const outputs = Object.entries(processor.outputs ?? {}).map(([path, hash]) => ({
        target: inside(root, relative(root, resolve(expand(path))).replaceAll('\\', '/')),
        sha1: expand(hash),
        url: '',
      }));
      if (
        outputs.length &&
        (await Promise.all(outputs.map((file) => fileValid(file, progress.signal)))).every(Boolean)
      )
        continue;
      const jar = artifactPath(processor.jar);
      const processorZip = await open(jar);
      let mainClass: string | undefined;
      try {
        const manifest = (await readAllEntries(processorZip)).find(
          (entry) => entry.fileName === 'META-INF/MANIFEST.MF',
        );
        const text = manifest
          ? (await readEntry(processorZip, manifest)).toString('utf8').replace(/\r?\n /g, '')
          : '';
        mainClass = /^Main-Class:\s*(.+)$/m.exec(text)?.[1]?.trim();
      } finally {
        processorZip.close();
      }
      if (!mainClass) throw new Error(tr('engine.processorMainMissing', { name: processor.jar }));
      await execute(
        input.java,
        [
          '-cp',
          [jar, ...processor.classpath.map(artifactPath)].join(delimiter),
          mainClass,
          ...processor.args.map(expand),
        ],
        {
          cwd: root,
          windowsHide: true,
          signal: progress.signal,
          maxBuffer: 16 * 1024 * 1024,
        },
      );
      for (const output of outputs)
        if (!(await fileValid(output, progress.signal)))
          throw new Error(tr('engine.processorOutputInvalid', { path: output.target }));
    }
    const target = inside(root, `versions/${version.id}/${version.id}.json`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(version, null, 2));
    return version.id;
  } finally {
    zip.close();
    // mkdtemp created this directory under the instance's .nixel directory.
    await rm(temporary, { recursive: true, force: true });
  }
}
