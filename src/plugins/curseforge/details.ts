import type {
  ResourceDependency,
  ResourceDetails,
  ResourceVersionDetails,
} from '../../shared/contracts';
import { tr } from '../../shared/i18n';
import type { CurseForgeClient } from './client';
import type { CurseForgeProject } from './models';
import { id } from './rules';

const relationTypes: Record<number, ResourceDependency['type']> = {
  1: 'embedded',
  2: 'optional',
  3: 'required',
  4: 'tool',
  5: 'incompatible',
  6: 'include',
};

export async function projectDetails(
  client: CurseForgeClient,
  projectId: string,
): Promise<ResourceDetails> {
  const projectNumber = id(projectId);
  const [project, description] = await Promise.all([
    client.project(projectNumber),
    client.request<string>(`mods/${projectNumber}/description`),
  ]);
  return {
    description: { content: description.data, format: 'html' },
    gallery: project.screenshots.map((image) => ({
      url: image.url,
      title: image.title,
      description: image.description,
    })),
    url: project.links.websiteUrl,
  };
}

export async function versionDetails(
  client: CurseForgeClient,
  projectId: string,
  versionId: string,
): Promise<ResourceVersionDetails> {
  const projectNumber = id(projectId);
  const fileNumber = id(versionId);
  const [file, changelog] = await Promise.all([
    client.file(projectNumber, fileNumber),
    client.request<string>(`mods/${projectNumber}/files/${fileNumber}/changelog`),
  ]);
  const modIds = [...new Set(file.dependencies.map((item) => item.modId))];
  const projects = modIds.length
    ? (await client.request<CurseForgeProject[]>('mods', {}, undefined, { modIds })).data
    : [];
  return {
    changelog: { content: changelog.data, format: 'html' },
    dependencies: file.dependencies.map((item) => {
      const project = projects.find((project) => project.id === item.modId);
      return {
        projectId: String(item.modId),
        name: project?.name || tr('resourceDetails.unavailableDependency'),
        type: relationTypes[item.relationType] ?? 'unknown',
        url: project?.links.websiteUrl,
      };
    }),
  };
}
