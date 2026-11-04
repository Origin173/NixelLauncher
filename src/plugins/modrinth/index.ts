import type { Context } from 'cordis';
import { serviceEnvironment } from '../../host/service-environment';
import type { ResourceProvider } from '../providers';
import { optionalDependencies, resolveContentPlan } from '../resource-dependencies';
import { listVersions, searchProjects } from './catalog';
import { ModrinthClient } from './client';
import { contentResolver } from './dependencies';
import { projectDetails, versionDetails } from './details';
import { installProject } from './install';
import { downloadPack } from './pack';
import { resourcesId } from './rules';
import { checkUpdates } from './updates';

export { resourcesId };
export const resourcesPlugin = {
  name: resourcesId,
  inject: ['nixel'],
  apply(ctx: Context) {
    const host = ctx.nixel;
    const client = new ModrinthClient({
      'User-Agent': 'NixelLauncher/0.1.0',
      ...(serviceEnvironment.modrinthToken
        ? { Authorization: serviceEnvironment.modrinthToken }
        : {}),
    });
    const provider: ResourceProvider = {
      downloadModpack: (projectId, versionId, task) =>
        downloadPack(host, client, projectId, versionId, task),
      planInstall: (roots, instance, retained, signal) =>
        resolveContentPlan(
          roots,
          contentResolver(client, instance, signal),
          retained,
          signal,
          [],
          true,
        ),
      search: (query, instance) => searchProjects(client, query, instance),
      versions: (id, instance, signal) => listVersions(client, id, instance, signal),
      details: (id) => projectDetails(client, id),
      versionDetails: (id, versionId) => versionDetails(client, id, versionId),
      optionalDependencies: async (id, version, instance) => {
        const load = contentResolver(client, instance);
        return optionalDependencies(await load(id, version), load);
      },
      install: (id, version, instance, task, options) =>
        installProject(host, client, id, version, instance, task, options),
      checkUpdates: (instance, task) => checkUpdates(host, client, instance, task),
    };
    host.providers.register(
      ctx,
      {
        id: resourcesId,
        pluginId: resourcesId,
        kind: 'resources',
        name: 'Modrinth',
        capabilities: ['mods', 'resourcepacks', 'shaders', 'modpacks'],
      },
      provider,
    );
  },
};
