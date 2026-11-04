import { satisfies } from 'semver';
import type { NixelPluginManifest, PluginItem } from '../../shared/contracts';
import { tr } from '../../shared/i18n';
import { dependencies } from './manifest';

export function dependencyProblems(manifest: NixelPluginManifest, installed: PluginItem[]) {
  const entries = new Map(
    installed.map((item) => [item.id, { manifest: item.manifest, enabled: item.enabled }]),
  );
  entries.set(manifest.id, { manifest, enabled: true });
  const problems: string[] = [];
  const relevant = new Set<string>();
  const collect = (id: string) => {
    if (relevant.has(id)) return;
    relevant.add(id);
    const entry = entries.get(id);
    if (entry)
      for (const dependency of Object.keys(dependencies(entry.manifest))) collect(dependency);
  };
  collect(manifest.id);
  for (const { manifest: consumer, enabled } of entries.values()) {
    if (!enabled) continue;
    for (const [id, range] of Object.entries(dependencies(consumer))) {
      if (!relevant.has(consumer.id) && id !== manifest.id) continue;
      const target = entries.get(id);
      if (!target?.enabled || !satisfies(target.manifest.version, range))
        problems.push(
          tr('pluginDist.dependency', {
            id: consumer.id,
            dependency: id,
            range,
            version: target?.enabled ? target.manifest.version : tr('pluginDist.missing'),
          }),
        );
    }
  }
  const visited = new Set<string>();
  const visit = (id: string, ancestors: Set<string>) => {
    if (ancestors.has(id)) {
      problems.push(tr('pluginDist.cycle', { id }));
      return;
    }
    if (visited.has(id)) return;
    visited.add(id);
    const item = entries.get(id);
    if (item)
      for (const dependency of Object.keys(dependencies(item.manifest)))
        visit(dependency, new Set(ancestors).add(id));
  };
  visit(manifest.id, new Set());
  return problems;
}
