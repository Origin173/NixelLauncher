import type {
  Instance,
  ResourceDependencySelection,
  ResourceOptionalDependency,
} from '../shared/contracts';
import { errorMessage } from '../shared/error-message';
import type { NixelHost, TaskContext } from '../shared/host-api';
import { tr } from '../shared/i18n';
import {
  assertRequiredContentEnabled,
  type ContentDownload,
  installContentFile,
  normalizeResourceSource,
} from './resource-files';
import { taskPhase } from './task-progress';

interface Dependency {
  projectId?: string;
  versionId?: string;
  type: string;
  name?: string;
}
export interface ContentNode {
  file: ContentDownload;
  dependencies: Dependency[];
}
export type ContentResolver = (projectId?: string, versionId?: string) => Promise<ContentNode>;

function matches(dependency: Dependency, selection: ResourceDependencySelection) {
  return (
    Boolean(dependency.projectId || dependency.versionId) &&
    (!dependency.projectId || dependency.projectId === selection.projectId) &&
    (!dependency.versionId || dependency.versionId === selection.versionId)
  );
}

export async function optionalDependencies(root: ContentNode, load: ContentResolver) {
  const result: ResourceOptionalDependency[] = [];
  for (const dependency of root.dependencies.filter((entry) => entry.type === 'optional')) {
    try {
      const { file } = await load(dependency.projectId, dependency.versionId);
      result.push({
        projectId: file.projectId,
        versionId: file.versionId,
        name: file.name,
        version: file.version,
        icon: file.icon,
      });
    } catch (error) {
      result.push({
        projectId: dependency.projectId,
        versionId: dependency.versionId,
        name:
          dependency.name || dependency.projectId || tr('resourceDetails.unavailableDependency'),
        reason: errorMessage(error),
      });
    }
  }
  return [
    ...new Map(
      result.map((entry) => [
        JSON.stringify([entry.projectId, entry.versionId, entry.name]),
        entry,
      ]),
    ).values(),
  ];
}

/** Resolve and validate the entire selection before modifying any instance files. */
export async function installContentPlan(
  host: NixelHost,
  instance: Instance,
  task: TaskContext,
  roots: ResourceDependencySelection[],
  load: ContentResolver,
  optional: ResourceDependencySelection[] = [],
) {
  const pins = new Map<string, string>();
  const nodes = new Map<string, ContentNode>();
  const ordered: ContentDownload[] = [];
  const dependencies = new Set<string>();
  function pin(projectId: string, versionId: string) {
    const previous = pins.get(projectId);
    if (previous && previous !== versionId)
      throw new Error(tr('optionalDependencies.conflict', { project: projectId }));
    pins.set(projectId, versionId);
  }
  for (const entry of [...roots, ...optional]) pin(entry.projectId, entry.versionId);
  const rootNodes: ContentNode[] = [];
  for (const entry of roots) rootNodes.push(await load(entry.projectId, entry.versionId));
  if (
    optional.length &&
    (rootNodes.length !== 1 ||
      optional.some(
        (entry) =>
          !rootNodes[0]?.dependencies.some(
            (dependency) => dependency.type === 'optional' && matches(dependency, entry),
          ),
      ))
  )
    throw new Error(tr('optionalDependencies.selectionChanged'));
  async function visit(node: ContentNode, dependency = false) {
    task.signal.throwIfAborted();
    const { file } = node;
    pin(file.projectId, file.versionId);
    if (dependency) dependencies.add(file.projectId);
    if (nodes.has(file.projectId)) return;
    nodes.set(file.projectId, node);
    for (const entry of node.dependencies.filter((entry) => entry.type === 'required')) {
      const versionId =
        entry.versionId || (entry.projectId ? pins.get(entry.projectId) : undefined);
      await visit(await load(entry.projectId, versionId), true);
    }
    ordered.push(file);
  }
  for (const entry of optional) await visit(await load(entry.projectId, entry.versionId), true);
  for (const node of rootNodes) await visit(node);
  const installed = host.store.read().content.filter((entry) => entry.instance === instance.id);
  for (const node of nodes.values()) {
    const current = installed.filter(
      (entry) => normalizeResourceSource(entry.source) === node.file.source,
    );
    const enabled = (file: ContentDownload) =>
      current.find((entry) => entry.projectId === file.projectId)?.enabled !== false;
    const effective = [
      ...current.filter((entry) => entry.enabled && !nodes.has(entry.projectId ?? '')),
      ...ordered.filter(enabled),
    ];
    for (const entry of node.dependencies.filter((entry) => entry.type === 'incompatible')) {
      if (
        enabled(node.file) &&
        effective.some(
          (file) =>
            file.projectId &&
            file.versionId &&
            matches(entry, { projectId: file.projectId, versionId: file.versionId }),
        )
      )
        throw new Error(tr('optionalDependencies.conflict', { project: node.file.name }));
    }
    if (dependencies.has(node.file.projectId))
      assertRequiredContentEnabled(host, instance, node.file.source, node.file.projectId);
  }
  for (const [index, file] of ordered.entries())
    await installContentFile(
      host,
      instance,
      taskPhase(task, (index / ordered.length) * 100, ((index + 1) / ordered.length) * 100),
      file,
    );
}
