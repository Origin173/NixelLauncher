import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { InstalledContent } from '../../../shared/contracts';
import type { NixelHost, TaskContext } from '../../../shared/host-api';
import { tr } from '../../../shared/i18n';
import type {
  VersionContentPlan,
  VersionContentPlanInput,
  VersionContentRoot,
} from '../../../shared/version-content';
import { checkedPath } from '../../file-transaction';
import { inside } from '../../files';
import { getInstance } from '../../instance-state';
import type { ResourceProvider } from '../../providers';
import { type ContentDownload, normalizeResourceSource } from '../../resource-files';
import { contentPath, contentState } from './content-state';
import { planVersionChange } from './plan';
export interface PlannedDownload extends ContentDownload {
  enabled: boolean;
  existingId?: string;
  path: string;
}
export interface PreparedVersionContent {
  view: VersionContentPlan;
  initialFingerprint: string;
  choices: VersionContentPlanInput['choices'];
  entries: InstalledContent[];
  downloads: PlannedDownload[];
}
export function contentPlanDirectory(host: NixelHost, id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    throw new Error(tr('versionContent.expired'));
  return join(host.store.cacheRoot, 'version-content', id);
}
export async function readContentPlan(
  host: NixelHost,
  id: string,
): Promise<PreparedVersionContent> {
  return JSON.parse(
    await readFile(join(contentPlanDirectory(host, id), 'plan.json'), 'utf8'),
  ) as PreparedVersionContent;
}
export async function planVersionContent(
  host: NixelHost,
  input: VersionContentPlanInput,
  id = randomUUID(),
  task?: TaskContext,
): Promise<VersionContentPlan> {
  const review = await planVersionChange(host, input.id, input.target, task?.signal, task?.taskId);
  if (review.fingerprint !== input.fingerprint) throw new Error(tr('versionChange.reviewChanged'));
  const instance = structuredClone(getInstance(host, input.id));
  const state = await contentState(host, instance, review.target, task?.signal);
  if (state.fingerprint !== input.fingerprint) throw new Error(tr('versionChange.reviewChanged'));
  const rootsBySource = new Map<string, VersionContentRoot[]>();
  const retained: InstalledContent[] = [];
  const choices: VersionContentPlanInput['choices'] = {};
  for (const entry of state.entries) {
    const item = review.content.find((item) => item.id === entry.id);
    if (!item) throw new Error(tr('versionChange.reviewChanged'));
    const choice = input.choices[entry.id];
    if (!choice || !['keep', 'disable', 'update'].includes(choice.action))
      throw new Error(tr('versionContent.chooseActions'));
    choices[entry.id] = choice;
    if (choice.action === 'update') {
      if (
        !entry.projectId ||
        !item.source ||
        !item.candidates.some((candidate) => candidate.id === choice.versionId)
      )
        throw new Error(tr('versionContent.invalidVersion'));
      const roots = rootsBySource.get(item.source) || [];
      if (
        roots.some(
          (root) =>
            root.projectId === entry.projectId &&
            (root.versionId !== choice.versionId || root.enabled !== entry.enabled),
        )
      )
        throw new Error(tr('optionalDependencies.conflict', { project: entry.name }));
      roots.push({
        projectId: entry.projectId,
        versionId: choice.versionId,
        enabled: entry.enabled,
      });
      rootsBySource.set(item.source, roots);
    } else
      retained.push({ ...entry, enabled: choice.action === 'disable' ? false : entry.enabled });
  }
  const downloads: PlannedDownload[] = [];
  const target = { ...instance, ...review.target };
  for (const [source, roots] of rootsBySource) {
    const provider = host.providers.get<ResourceProvider>('resources', source);
    if (!provider.planInstall) throw new Error(tr('versionContent.unsupported', { source }));
    const sourceRetained = retained.filter(
      (entry) => normalizeResourceSource(entry.source) === source,
    );
    const files = await provider.planInstall(roots, target, sourceRetained, task?.signal);
    for (const root of roots)
      if (
        !files.some(
          (file) => file.projectId === root.projectId && file.versionId === root.versionId,
        )
      )
        throw new Error(tr('versionContent.invalidVersion'));
    const seen = new Map<string, string>();
    for (const file of files) {
      if (file.source !== source) throw new Error(tr('versionContent.invalidVersion'));
      if (/[\\/]/.test(file.fileName)) throw new Error(tr('files.theFilePathContainsAnUnsafeName'));
      const previousVersion = seen.get(file.projectId);
      if (previousVersion && previousVersion !== file.versionId)
        throw new Error(tr('optionalDependencies.conflict', { project: file.name }));
      if (previousVersion) continue;
      seen.set(file.projectId, file.versionId);
      const kept = sourceRetained.find((entry) => entry.projectId === file.projectId);
      if (kept) {
        if (kept.versionId !== file.versionId)
          throw new Error(tr('optionalDependencies.conflict', { project: file.name }));
        continue;
      }
      const previous = state.entries.find(
        (entry) =>
          normalizeResourceSource(entry.source) === source && entry.projectId === file.projectId,
      );
      const enabled = previous?.enabled ?? true;
      const path = contentPath({
        ...file,
        fileName: enabled ? file.fileName : `${file.fileName}.disabled`,
      });
      inside(instance.directory, path);
      downloads.push({ ...file, enabled, existingId: previous?.id, path });
    }
  }
  const destinations = new Map<string, string>();
  for (const file of downloads) {
    const key = file.path.toLowerCase();
    if (destinations.has(key))
      throw new Error(tr('versionContent.pathConflict', { path: file.path }));
    destinations.set(key, file.path);
    const targetPath = await checkedPath(instance.directory, file.path);
    const exists = await lstat(targetPath).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return false;
        throw error;
      },
    );
    const current = state.entries.find((entry) => contentPath(entry).toLowerCase() === key);
    if (exists && !current) throw new Error(tr('versionContent.pathConflict', { path: file.path }));
    if (
      current &&
      (choices[current.id]?.action !== 'update' ||
        normalizeResourceSource(current.source) !== file.source ||
        current.projectId !== file.projectId)
    )
      throw new Error(tr('versionContent.pathConflict', { path: file.path }));
  }
  for (const entry of state.entries.filter(
    (entry) => entry.enabled && choices[entry.id]?.action === 'disable',
  )) {
    const path = `${contentPath(entry)}.disabled`;
    if (
      destinations.has(path.toLowerCase()) ||
      state.entries.some((other) => contentPath(other).toLowerCase() === path.toLowerCase())
    )
      throw new Error(tr('versionContent.pathConflict', { path }));
    destinations.set(path.toLowerCase(), path);
    const destination = await checkedPath(instance.directory, path);
    const exists = await lstat(destination).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return false;
        throw error;
      },
    );
    if (exists) throw new Error(tr('versionContent.pathConflict', { path }));
  }
  task?.signal.throwIfAborted();
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ state: state.fingerprint, choices, downloads }))
    .digest('hex');
  const view: VersionContentPlan = {
    id,
    instanceId: input.id,
    target: review.target,
    fingerprint,
    files: [],
    disabled: state.entries
      .filter((entry) => entry.enabled && choices[entry.id]?.action === 'disable')
      .map(({ id, name }) => ({ id, name })),
    retainedRisks: review.content
      .filter(
        (entry) =>
          entry.enabled && entry.status !== 'compatible' && choices[entry.id]?.action === 'keep',
      )
      .map(({ id, name }) => ({ id, name })),
    minecraftChanged: instance.version !== review.target.version,
  };
  // Only public review fields go to the renderer; download URLs/hashes stay in Host cache.
  view.files = downloads.map((file) => ({
    source: file.source,
    projectId: file.projectId,
    versionId: file.versionId,
    name: file.name,
    version: file.version,
    fileName: file.path,
    category: file.category,
    enabled: file.enabled,
    dependency: !rootsBySource.get(file.source)?.some((root) => root.projectId === file.projectId),
  }));
  const directory = contentPlanDirectory(host, id);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, 'plan.json'),
    JSON.stringify({
      view,
      initialFingerprint: state.fingerprint,
      choices,
      entries: state.entries,
      downloads,
    } satisfies PreparedVersionContent),
  );
  return view;
}
