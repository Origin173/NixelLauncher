import { randomUUID } from 'node:crypto';
import { rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ContentCategory, Instance } from '../shared/contracts';
import type { NixelHost, TaskContext } from '../shared/host-api';
import { download, inside } from './files';

export const contentDirectories: Record<ContentCategory, string> = {
  模组: 'mods',
  资源包: 'resourcepacks',
  光影: 'shaderpacks',
};

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
    throw new Error(`必需依赖「${disabled.name}」当前已禁用，请先在实例内容中启用后再安装`);
}

interface ContentDownload {
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
    throw new Error(`文件 ${file.fileName} 已由其他资源或本地文件使用，请先移除冲突文件`);
  if (
    !previous.some((entry) => entry.category === file.category && entry.fileName === fileName) &&
    (await stat(target).then(
      () => true,
      () => false,
    ))
  )
    throw new Error(`目标文件已存在：${fileName}，请先移除冲突文件`);
  task.log(`安装 ${file.name} ${file.version}`);
  await download(file.url, target, task.signal, file.hashes, (current, total) =>
    task.report(total ? (current / total) * 100 : 0, `下载 ${file.name}`),
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
