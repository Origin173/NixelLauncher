import { readFile } from 'node:fs/promises';
import { release } from 'node:os';
import { join } from 'node:path';
import { tr } from '../shared/i18n';
import { inside } from './files';

export interface DownloadArtifact {
  url: string;
  sha1?: string;
  size?: number;
  path?: string;
}
export interface Rule {
  action: 'allow' | 'disallow';
  os?: { name?: string; arch?: string; version?: string };
  features?: Record<string, boolean>;
}
export type Argument = string | { rules: Rule[]; value: string | string[] };
export interface Library {
  name: string;
  url?: string;
  rules?: Rule[];
  downloads?: { artifact?: DownloadArtifact; classifiers?: Record<string, DownloadArtifact> };
  natives?: Record<string, string>;
  extract?: { exclude?: string[] };
}
export interface MinecraftVersion {
  id: string;
  inheritsFrom?: string;
  jar?: string;
  type: string;
  mainClass: string;
  libraries: Library[];
  arguments?: { jvm?: Argument[]; game?: Argument[] };
  minecraftArguments?: string;
  javaVersion?: { majorVersion: number; component?: string };
  downloads?: { client?: DownloadArtifact; client_mappings?: DownloadArtifact };
  assetIndex?: DownloadArtifact & { id: string };
  assets?: string;
  logging?: { client: { argument: string; file: DownloadArtifact & { id: string } } };
}
export const platformName =
  process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux';

export function rulesAllow(rules?: Rule[], features: Record<string, boolean> = {}) {
  if (!rules) return true;
  let allowed = false;
  for (const rule of rules) {
    const arch = rule.os?.arch;
    const matches =
      (!rule.os?.name || rule.os.name === platformName) &&
      (!arch ||
        arch === process.arch ||
        (arch === 'x86' && process.arch === 'ia32') ||
        (['amd64', 'x86_64'].includes(arch) && process.arch === 'x64')) &&
      (!rule.os?.version || new RegExp(rule.os.version).test(release())) &&
      Object.entries(rule.features ?? {}).every(
        ([key, value]) => (features[key] ?? false) === value,
      );
    if (matches) allowed = rule.action === 'allow';
  }
  return allowed;
}

export function mavenPath(coordinate: string) {
  const [notation = '', extension = 'jar'] = coordinate.split('@');
  const [group, artifact, version, classifier] = notation.split(':');
  if (!group || !artifact || !version)
    throw new Error(tr('engine.invalidLibrary', { name: coordinate }));
  return `${group.replaceAll('.', '/')}/${artifact}/${version}/${artifact}-${version}${classifier ? `-${classifier}` : ''}.${extension}`;
}

function libraryKey(library: Library) {
  const [group, artifact, , classifier] = library.name.split(':');
  return `${group}:${artifact}:${classifier ?? ''}`;
}

export async function readVersion(
  root: string,
  id: string,
  parents = new Set<string>(),
): Promise<MinecraftVersion> {
  if (parents.has(id)) throw new Error(tr('engine.inheritanceCycle', { id }));
  parents.add(id);
  const path = inside(root, `versions/${id}/${id}.json`);
  const version = JSON.parse(await readFile(path, 'utf8')) as MinecraftVersion;
  if (!version.id || !Array.isArray(version.libraries))
    throw new Error(tr('engine.invalidVersion', { id }));
  if (!version.inheritsFrom) return { ...version, jar: version.jar ?? id };
  const parent = await readVersion(root, version.inheritsFrom, parents);
  // A child replaces matching Maven modules, while retaining all platform variants of its own.
  const keys = new Set(version.libraries.map(libraryKey));
  return {
    ...parent,
    ...version,
    jar: version.jar ?? parent.jar,
    downloads: { ...parent.downloads, ...version.downloads },
    libraries: [
      ...parent.libraries.filter((library) => !keys.has(libraryKey(library))),
      ...version.libraries,
    ],
    arguments: {
      jvm: [...(parent.arguments?.jvm ?? []), ...(version.arguments?.jvm ?? [])],
      game: [...(parent.arguments?.game ?? []), ...(version.arguments?.game ?? [])],
    },
  };
}

export function libraryArtifacts(libraries: Library[], root: string) {
  return libraries
    .filter((library) => rulesAllow(library.rules))
    .flatMap((library) => {
      const files: (DownloadArtifact & { target: string; native?: { exclude: string[] } })[] = [];
      const artifact = library.downloads?.artifact;
      if (artifact || !library.downloads) {
        const path = artifact?.path ?? mavenPath(library.name);
        files.push({
          ...artifact,
          url: artifact?.url ?? `${library.url ?? 'https://libraries.minecraft.net/'}${path}`,
          target: inside(join(root, 'libraries'), path),
        });
      }
      const classifier = library.natives?.[platformName]?.replaceAll(
        /\$\{arch\}/g,
        process.arch === 'ia32' ? '32' : '64',
      );
      if (classifier) {
        const native = library.downloads?.classifiers?.[classifier];
        if (!native) throw new Error(tr('engine.nativeMissing', { name: library.name }));
        files.push({
          ...native,
          target: inside(
            join(root, 'libraries'),
            native.path ?? mavenPath(`${library.name}:${classifier}`),
          ),
          native: { exclude: library.extract?.exclude ?? ['META-INF/'] },
        });
      }
      return files;
    });
}
