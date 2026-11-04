import type { ResourceDetails, ResourceVersionDetails } from '../../shared/contracts';
import { tr } from '../../shared/i18n';
import type { ModrinthClient } from './client';

export async function projectDetails(
  client: ModrinthClient,
  projectId: string,
): Promise<ResourceDetails> {
  const project = await client.getProject(projectId);
  return {
    description: { content: project.body, format: 'markdown' },
    gallery: [...project.gallery]
      .sort((a, b) => Number(b.featured) - Number(a.featured) || a.ordering - b.ordering)
      .map((image) => ({
        url: image.url,
        title: image.title ?? undefined,
        description: image.description ?? undefined,
      })),
    url: `https://modrinth.com/${project.project_type}/${project.slug}`,
  };
}

export async function versionDetails(
  client: ModrinthClient,
  projectId: string,
  versionId: string,
): Promise<ResourceVersionDetails> {
  const version = await client.getProjectVersion(versionId);
  if (version.project_id !== projectId)
    throw new Error(tr('resources.theResourceAndVersionDoNotMatch'));
  const versionIds = [
    ...new Set(
      version.dependencies
        .filter((item) => !item.project_id && item.version_id)
        .map((item) => item.version_id as string),
    ),
  ];
  const versions = versionIds.length ? await client.getVersions(versionIds) : [];
  const dependencies = version.dependencies.map((item) => ({
    ...item,
    project_id:
      item.project_id || versions.find((version) => version.id === item.version_id)?.project_id,
  }));
  const projectIds = [
    ...new Set(dependencies.flatMap((item) => (item.project_id ? [item.project_id] : []))),
  ];
  const projects = projectIds.length ? await client.getProjects(projectIds) : [];
  return {
    changelog: { content: version.changelog ?? '', format: 'markdown' },
    dependencies: dependencies.map((item) => {
      const project = projects.find((project) => project.id === item.project_id);
      return {
        projectId: item.project_id ?? undefined,
        versionId: item.version_id ?? undefined,
        name: project?.title || item.file_name || tr('resourceDetails.unavailableDependency'),
        type: item.dependency_type,
        url: project ? `https://modrinth.com/${project.project_type}/${project.slug}` : undefined,
      };
    }),
  };
}
