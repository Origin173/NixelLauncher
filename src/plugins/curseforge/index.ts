import type { Context } from 'cordis';
import type { CurseForgeResourceProvider } from '../providers';
import { optionalDependencies } from '../resource-dependencies';
import { listVersions, searchProjects } from './catalog';
import { CurseForgeClient } from './client';
import { contentResolver } from './dependencies';
import { projectDetails, versionDetails } from './details';
import { installFiles } from './install';
import { downloadPack } from './pack';
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
      versions: (projectId, instance, signal) => listVersions(client, projectId, instance, signal),
      details: (id) => projectDetails(client, id),
      versionDetails: (id, versionId) => versionDetails(client, id, versionId),
      optionalDependencies: async (id, version, instance) => {
        const load = contentResolver(client, instance);
        return optionalDependencies(await load(id, version), load);
      },
      install: (projectId, versionId, instance, task, options) =>
        installFiles(
          host,
          client,
          [{ projectID: id(projectId), fileID: id(versionId) }],
          instance,
          task,
          true,
          options,
        ),
      resolvePackFiles: async (files, instance, signal) => {
        await client.prepareFiles(files, signal);
        const load = contentResolver(client, instance, signal);
        const result = [];
        for (const file of files)
          result.push((await load(String(file.projectID), String(file.fileID))).file);
        return result;
      },
      downloadModpack: (projectId, versionId, task) =>
        downloadPack(host, client, id(projectId), id(versionId), task),
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
