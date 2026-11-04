import type { Context } from 'cordis';
import { serviceEnvironment } from '../../host/service-environment';
import type { ResourceProvider } from '../providers';
import { listVersions, searchProjects } from './catalog';
import { ModrinthClient } from './client';
import { projectDetails, versionDetails } from './details';
import { installProject } from './install';
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
      search: (query, instance) => searchProjects(client, query, instance),
      versions: (id, instance) => listVersions(client, id, instance),
      details: (id) => projectDetails(client, id),
      versionDetails: (id, versionId) => versionDetails(client, id, versionId),
      install: (id, version, instance, task) =>
        installProject(host, client, id, version, instance, task),
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
