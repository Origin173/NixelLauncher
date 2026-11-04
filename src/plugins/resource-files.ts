import { randomUUID } from 'node:crypto';
import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ContentCategory, InstalledContent, Instance } from '../shared/contracts';
import type { NixelHost, TaskContext } from '../shared/host-api';
import { tr } from '../shared/i18n';
import { download, inside } from './files';

export const contentDirectories: Record<ContentCategory, string> = {
  mods: 'mods',
  resourcepacks: 'resourcepacks',
  shaders: 'shaderpacks',
};

export async function scanContent(host: NixelHost, instance: Instance) {
  const known = host.store.read().content.filter((entry) => entry.instance === instance.id);
  const found: InstalledContent[] = [];
  for (const [category, directory] of Object.entries(contentDirectories)) {
    const root = join(instance.directory, directory);
    const entries = await readdir(root, { withFileTypes: true }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      },
    );
    for (const entry of entries)
      if (entry.isFile() && /\.(jar|zip)(\.disabled)?$/i.test(entry.name)) {
        const previous = known.find(
          (item) => item.category === category && item.fileName === entry.name,
        );
        found.push(
          previous || {
            id: randomUUID(),
            instance: instance.id,
            name: entry.name.replace(/\.(jar|zip)(\.disabled)?$/i, ''),
            version: '',
            category: category as ContentCategory,
            fileName: entry.name,
            enabled: !entry.name.endsWith('.disabled'),
            color: 'green',
          },
        );
      }
  }
  await host.store.update((draft) => {
    // Keep metadata written by an install or toggle while this directory scan was in flight.
    const current = draft.content.filter((entry) => entry.instance === instance.id);
    if (JSON.stringify(current) !== JSON.stringify(known)) return;
    draft.content = [...draft.content.filter((entry) => entry.instance !== instance.id), ...found];
  });
  return host.store.read().content.filter((entry) => entry.instance === instance.id);
}

export function normalizeResourceSource(source?: string) {
  if (source === 'Modrinth') return 'nixel.resources.modrinth';
  if (source === 'CurseForge') return 'nixel.resources.curseforge';
  return source;
}

export function assertRequiredContentEnabled(
  host: NixelHost,
  instance: Instance,
  source: string,
  projectId: string,
) {
  const disabled = host.store
    .read()
    .content.find(
      (entry) =>
        entry.instance === instance.id &&
        normalizeResourceSource(entry.source) === source &&
        entry.projectId === projectId &&
        !entry.enabled,
    );
  if (disabled)
    throw new Error(
      tr('resource-files.requiredDependencyValueIsDisabledEnableIt', { value1: disabled.name }),
    );
}

interface ContentDownload {
  icon?: string;
  source: string;
  projectId: string;
  versionId: string;
  name: string;
  version: string;
  category: ContentCategory;
  fileName: string;
  url: string;
  hashes: Record<string, string>;
}

export async function installContentFile(
  host: NixelHost,
  instance: Instance,
  task: TaskContext,
  file: ContentDownload,
) {
  const content = host.store.read().content.filter((entry) => entry.instance === instance.id);
  const previous = content.filter(
    (entry) =>
      normalizeResourceSource(entry.source) === file.source && entry.projectId === file.projectId,
  );
  const enabled = previous[0]?.enabled ?? true;
  const fileName = enabled ? file.fileName : `${file.fileName}.disabled`;
  const directory = join(instance.directory, contentDirectories[file.category]);
  const target = inside(directory, fileName);
  const collision = content.find(
    (entry) =>
      entry.category === file.category &&
      entry.fileName.replace(/\.disabled$/, '') === file.fileName &&
      !previous.some((old) => old.id === entry.id),
  );
  if (collision)
    throw new Error(
      tr('resource-files.fileValueIsUsedByAnotherResource', { value1: file.fileName }),
    );
  if (
    !previous.some((entry) => entry.category === file.category && entry.fileName === fileName) &&
    (await stat(target).then(
      () => true,
      () => false,
    ))
  )
    throw new Error(
      tr('resource-files.targetFileAlreadyExistsValueRemoveThe', { value1: fileName }),
    );
  task.log(tr('minecraft-engine.installValueValue', { value1: file.name, value2: file.version }));
  await download(file.url, target, task.signal, file.hashes, (current, total) =>
    task.report(
      total ? (current / total) * 100 : 0,
      tr('curseforge.downloadValue', { value1: file.name }),
    ),
  );
  for (const entry of previous)
    if (entry.category !== file.category || entry.fileName !== fileName)
      await rm(
        inside(join(instance.directory, contentDirectories[entry.category]), entry.fileName),
        { force: true },
      );
  await host.store.update((draft) => {
    draft.content = draft.content.filter(
      (entry) =>
        !(
          entry.instance === instance.id &&
          normalizeResourceSource(entry.source) === file.source &&
          entry.projectId === file.projectId
        ),
    );
    draft.content.push({
      id: previous[0]?.id || randomUUID(),
      instance: instance.id,
      name: file.name,
      icon: file.icon,
      version: file.version,
      category: file.category,
      fileName,
      enabled,
      color: 'green',
      projectId: file.projectId,
      versionId: file.versionId,
      source: file.source,
    });
  });
}
