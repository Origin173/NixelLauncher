import type { Context } from 'cordis';
import type { CurseForgeResourceProvider } from '../providers';
import { listVersions, searchProjects } from './catalog';
import { CurseForgeClient } from './client';
import { projectDetails, versionDetails } from './details';
import { installFiles } from './install';
import { curseforgeId, id } from './rules';
import { checkUpdates } from './updates';

export { curseforgeId };
export const curseforgePlugin = {
  name: curseforgeId,
  inject: ['nixel'],
  apply(ctx: Context) {
    const host = ctx.nixel;
    const client = new CurseForgeClient();
    const provider: CurseForgeResourceProvider = {
      search: (query, instance) => searchProjects(client, query, instance),
      versions: (projectId, instance) => listVersions(client, projectId, instance),
      details: (id) => projectDetails(client, id),
      versionDetails: (id, versionId) => versionDetails(client, id, versionId),
      install: (projectId, versionId, instance, task) =>
        installFiles(
          host,
          client,
          [{ projectID: id(projectId), fileID: id(versionId) }],
          instance,
          task,
          true,
        ),
      prepareFiles: (files, signal) => client.prepareFiles(files, signal),
      installFiles: (files, instance, task) => installFiles(host, client, files, instance, task),
      checkUpdates: (instance, task) => checkUpdates(host, client, instance, task),
    };
    host.providers.register(
      ctx,
      {
        id: curseforgeId,
        pluginId: curseforgeId,
        kind: 'resources',
        name: 'CurseForge',
        capabilities: ['mods', 'resourcepacks', 'shaders', 'modpacks'],
      },
      provider,
    );
  },
};
