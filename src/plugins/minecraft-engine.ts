import { MinecraftFolder, Version } from '@xmcl/core';
import {
  createDefaultNodeInstallRuntime,
  createFabricInstallWorkflow,
  createModernForgeInstallWorkflow,
  createQuiltInstallWorkflow,
  executeInstallManifest,
  executeInstallWorkflow,
  getForgeVersionList,
  getLoaderArtifactListFor,
  getQuiltLoaderVersionsByMinecraft,
  getVersionList,
  ProgressTrackerMultiple,
  resolveAssetMetadataInstallFiles,
  resolveAssetObjectInstallFiles,
  resolveForgeArtifactVersion,
  resolveForgeInstallerFile,
  resolveLibraryInstallFiles,
  resolveMinecraftJarInstallFile,
  resolveMinecraftVersionJsonInstallFile,
  resolveNeoForgedInstallerFile,
} from '@xmcl/installer';
import { json } from './files';

export type LoaderKind = 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'neoforge';
export interface InstallInput {
  directory: string;
  minecraft: string;
  loader: LoaderKind;
  loaderVersion?: string;
  java: string;
  concurrency?: number;
}
export interface WorkProgress {
  signal: AbortSignal;
  update: (message: string, current?: number, total?: number) => void;
}

export async function listMinecraftVersions() {
  return (await getVersionList()).versions.map((version) => ({
    id: version.id,
    type: version.type,
    releaseTime: version.releaseTime,
  }));
}

export async function listLoaderVersions(
  loader: LoaderKind,
  minecraft: string,
  signal?: AbortSignal,
) {
  if (loader === 'vanilla') return [];
  if (loader === 'quilt')
    return (await getQuiltLoaderVersionsByMinecraft({ minecraftVersion: minecraft, signal }))
      .map((entry) => entry.loader.version)
      .sort(
        (a, b) =>
          Number(a.includes('-')) - Number(b.includes('-')) ||
          b.localeCompare(a, 'en', { numeric: true }),
      );
  if (loader === 'fabric')
    return (await getLoaderArtifactListFor(minecraft, { signal })).map(
      (entry) => entry.loader.version,
    );
  if (loader === 'forge')
    return (await getForgeVersionList({ minecraft, signal })).versions.map(
      (version) => version.version,
    );
  const project = minecraft === '1.20.1' ? 'forge' : 'neoforge';
  const response = await fetch(
    `https://maven.neoforged.net/releases/net/neoforged/${project}/maven-metadata.xml`,
    { signal },
  );
  if (!response.ok) throw new Error(`NeoForge 版本查询失败：HTTP ${response.status}`);
  const content = await response.text();
  const [, minor, patch = '0'] = minecraft.split('.');
  const prefix =
    project === 'forge'
      ? `${minecraft}-`
      : Number(minecraft.split('.')[0]) >= 26
        ? `${minecraft}.`
        : `${minor}.${patch}.`;
  return [...content.matchAll(/<version>([^<]+)<\/version>/g)]
    .map((entry) => entry[1] || '')
    .filter((version) => version.startsWith(prefix))
    .reverse();
}

export async function requiredJava(minecraft: string, signal?: AbortSignal) {
  const metadata = (await getVersionList({ signal })).versions.find(
    (version) => version.id === minecraft,
  );
  if (!metadata) throw new Error(`Minecraft 版本不存在：${minecraft}`);
  const version = await json<{ javaVersion?: { majorVersion: number } }>(metadata.url, { signal });
  return version.javaVersion?.majorVersion || 8;
}

export async function installMinecraft(input: InstallInput, progress: WorkProgress) {
  const folder = MinecraftFolder.from(input.directory);
  const tracker = new ProgressTrackerMultiple();
  const runtime = createDefaultNodeInstallRuntime({
    signal: progress.signal,
    tracker,
    maxConcurrency: input.concurrency || 8,
  });
  let stage = '准备安装';
  const timer = setInterval(() => progress.update(stage, tracker.progress, tracker.total), 250);
  const execute = async (files: ReturnType<typeof resolveLibraryInstallFiles>, message: string) => {
    progress.signal.throwIfAborted();
    stage = message;
    progress.update(stage);
    await executeInstallManifest(
      { schemaVersion: 1, tasks: [{ id: message, type: 'files', files }] },
      runtime,
      { signal: progress.signal },
    );
  };
  try {
    const metadata = (await getVersionList({ signal: progress.signal })).versions.find(
      (version) => version.id === input.minecraft,
    );
    if (!metadata) throw new Error(`Minecraft 版本不存在：${input.minecraft}`);
    await execute([resolveMinecraftVersionJsonInstallFile(metadata, folder)], '下载游戏版本信息');
    let version = await Version.parse(folder, input.minecraft);
    const jar = resolveMinecraftJarInstallFile(version);
    await execute(jar ? [jar] : [], '下载游戏本体');
    await execute(resolveLibraryInstallFiles(version.libraries, folder), '下载基础游戏依赖库');
    let versionId = input.minecraft;
    if (input.loader !== 'vanilla') {
      const loaderVersion =
        input.loaderVersion ||
        (await listLoaderVersions(input.loader, input.minecraft, progress.signal))[0];
      if (!loaderVersion) throw new Error('未找到兼容的加载器版本');
      stage = `安装 ${input.loader} ${loaderVersion}`;
      progress.update(stage);
      if (input.loader === 'fabric' || input.loader === 'quilt') {
        versionId = await executeInstallWorkflow(
          (input.loader === 'quilt' ? createQuiltInstallWorkflow : createFabricInstallWorkflow)({
            minecraft: folder,
            minecraftVersion: input.minecraft,
            version: loaderVersion,
            signal: progress.signal,
          }),
          runtime,
          { signal: progress.signal },
        );
      } else {
        const neoProject = input.minecraft === '1.20.1' ? 'forge' : 'neoforge';
        const artifactVersion =
          input.loader === 'forge'
            ? resolveForgeArtifactVersion(input.minecraft, loaderVersion)
            : loaderVersion;
        const { file } =
          input.loader === 'forge'
            ? resolveForgeInstallerFile(artifactVersion, undefined, folder, {})
            : await resolveNeoForgedInstallerFile(neoProject, loaderVersion, folder, {
                signal: progress.signal,
              });
        const result = await executeInstallWorkflow(
          createModernForgeInstallWorkflow({
            id: `${input.loader}-${artifactVersion}`,
            minecraft: folder,
            minecraftVersion: input.minecraft,
            artifactVersion,
            installer: file,
            java: input.java,
            installOptions: {},
            side: 'client',
          }),
          runtime,
          {
            signal: progress.signal,
            onEvent: (event) => {
              if (event.type === 'task-start') {
                stage = event.task.id;
                progress.update(stage);
              }
            },
          },
        );
        versionId = result.version;
      }
      version = await Version.parse(folder, versionId);
    }
    await execute(resolveLibraryInstallFiles(version.libraries, folder), '下载游戏依赖库');
    await execute(resolveAssetMetadataInstallFiles(version, folder), '下载资源索引');
    await execute(await resolveAssetObjectInstallFiles(version, folder), '下载游戏资源');
    return versionId;
  } finally {
    clearInterval(timer);
  }
}
