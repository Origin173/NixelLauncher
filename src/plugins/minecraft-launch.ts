import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { basename, delimiter, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { ZipFile } from 'yazl';
import { tr } from '../shared/i18n';
import { launcherName, launcherVersion } from '../shared/launcher-metadata';
import type { ServerAddress } from '../shared/servers';
import type { GameSession } from './authentication';
import { inside } from './files';
import {
  type Argument,
  libraryArtifacts,
  type MinecraftVersion,
  rulesAllow,
} from './minecraft-version';
import { extractEntry, open, readAllEntries } from './zip';

interface LaunchInput extends GameSession {
  server?: ServerAddress;
  version: MinecraftVersion;
  gamePath: string;
  javaPath: string;
  javaMajor: number;
  maxMemory: number;
  minMemory: number;
  extraJVMArgs: string[];
  extraMCArgs: string[];
  resolution: { width: number; height: number; fullscreen: boolean };
  signal: AbortSignal;
}

export async function launchMinecraft(input: LaunchInput) {
  const { version, gamePath: root, signal } = input;
  const workRoot = inside(root, '.nixel');
  await mkdir(workRoot, { recursive: true });
  const temporary = await mkdtemp(join(workRoot, 'launch-'));
  const dispose = () => rm(temporary, { recursive: true, force: true });
  try {
    const libraries = libraryArtifacts(version.libraries, root);
    for (const file of libraries.filter((file) => file.native)) {
      signal.throwIfAborted();
      const zip = await open(file.target);
      try {
        for (const entry of await readAllEntries(zip))
          if (
            !entry.fileName.endsWith('/') &&
            !file.native?.exclude.some((prefix) => entry.fileName.startsWith(prefix))
          )
            await extractEntry(zip, entry, temporary, entry.fileName, signal);
      } finally {
        zip.close();
      }
    }
    const clientJar = inside(
      root,
      `versions/${version.jar ?? version.id}/${version.jar ?? version.id}.jar`,
    );
    const classpath = [
      ...new Set([
        ...libraries.filter((file) => !file.native).map((file) => file.target),
        clientJar,
      ]),
    ];
    let classpathText = classpath.join(delimiter);
    // Java 8 has no @argfile support; a manifest keeps Windows command lines short.
    if (process.platform === 'win32' && input.javaMajor < 9 && classpathText.length > 6000) {
      const text = `Class-Path: ${classpath.map((path) => pathToFileURL(path).href).join(' ')}`;
      const lines = [text.slice(0, 70)];
      for (let offset = 70; offset < text.length; offset += 69)
        lines.push(` ${text.slice(offset, offset + 69)}`);
      const archive = new ZipFile();
      const target = join(temporary, 'classpath.jar');
      archive.addBuffer(
        Buffer.from(`Manifest-Version: 1.0\r\n${lines.join('\r\n')}\r\n\r\n`),
        'META-INF/MANIFEST.MF',
      );
      const writing = pipeline(archive.outputStream, createWriteStream(target), { signal });
      archive.end();
      await writing;
      classpathText = target;
    }
    const values: Record<string, string> = {
      auth_player_name: input.gameProfile.name,
      auth_uuid: input.gameProfile.id,
      auth_access_token: input.accessToken,
      auth_session: `token:${input.accessToken}:${input.gameProfile.id}`,
      user_type: input.userType,
      user_properties: '{}',
      version_name: version.id,
      version_type: version.type ?? 'release',
      game_directory: root,
      assets_root: join(root, 'assets'),
      assets_index_name: version.assetIndex?.id ?? version.assets ?? '',
      game_assets: join(root, 'assets/virtual', version.assets ?? 'legacy'),
      natives_directory: temporary,
      library_directory: join(root, 'libraries'),
      classpath: classpathText,
      classpath_separator: delimiter,
      launcher_name: launcherName,
      launcher_version: launcherVersion,
      resolution_width: String(input.resolution.width),
      resolution_height: String(input.resolution.height),
      clientid: input.clientId ?? '',
      auth_xuid: input.xuid ?? '',
    };
    const expand = (text: string) => {
      // Inherited clients keep their original filename; loader exclusions must match that file.
      if (text.startsWith('-DignoreList='))
        text = text.replace(/\$\{version_name\}\.jar/g, basename(clientJar));
      return text.replace(/\$\{([^}]+)\}/g, (_, key: string) => {
        if (values[key] === undefined) throw new Error(tr('engine.unknownVariable', { name: key }));
        return values[key];
      });
    };
    const argumentsFor = (args: Argument[]) =>
      args.flatMap((arg) =>
        typeof arg === 'string'
          ? [expand(arg)]
          : rulesAllow(arg.rules, { has_custom_resolution: !input.resolution.fullscreen })
            ? (Array.isArray(arg.value) ? arg.value : [arg.value]).map(expand)
            : [],
      );
    const defaults = [
      ...(process.platform === 'darwin' ? ['-XstartOnFirstThread'] : []),
      `-Djava.library.path=${temporary}`,
      '-cp',
      classpathText,
    ];
    const jvm = [
      `-Xms${input.minMemory}M`,
      `-Xmx${input.maxMemory}M`,
      ...argumentsFor(version.arguments?.jvm?.length ? version.arguments.jvm : defaults),
    ];
    if (version.logging?.client)
      jvm.push(
        version.logging.client.argument.replace(
          /\$\{path\}/g,
          inside(join(root, 'assets/log_configs'), version.logging.client.file.id),
        ),
      );
    if (input.yggdrasilAgent)
      jvm.push(`-javaagent:${input.yggdrasilAgent.jar}=${input.yggdrasilAgent.server}`);
    jvm.push(...input.extraJVMArgs);
    const game = version.arguments?.game?.length
      ? argumentsFor(version.arguments.game)
      : (version.minecraftArguments?.match(/(?:[^\s"]+|"[^"]*")+/g) ?? []).map((arg) =>
          expand(arg.replace(/^"|"$/g, '')),
        );
    if (input.resolution.fullscreen) game.push('--fullscreen');
    else if (!game.includes('--width'))
      game.push(
        '--width',
        String(input.resolution.width),
        '--height',
        String(input.resolution.height),
      );
    if (input.server) {
      // An explicit quick join replaces saved join targets for this launch only.
      const targetFlags = new Set([
        '--server',
        '--port',
        '--quickPlaySingleplayer',
        '--quickPlayMultiplayer',
        '--quickPlayRealms',
      ]);
      let skipTarget = false;
      for (const arg of input.extraMCArgs) {
        if (skipTarget) {
          skipTarget = false;
          continue;
        }
        if (targetFlags.has(arg)) skipTarget = true;
        else if (![...targetFlags].some((flag) => arg.startsWith(`${flag}=`))) game.push(arg);
      }
      const quickPlay = version.arguments?.game?.some((arg) =>
        (typeof arg === 'string'
          ? [arg]
          : Array.isArray(arg.value)
            ? arg.value
            : [arg.value]
        ).includes('--quickPlayMultiplayer'),
      );
      game.push(
        ...(quickPlay
          ? ['--quickPlayMultiplayer', input.server.address]
          : ['--server', input.server.host, '--port', String(input.server.port)]),
      );
    } else game.push(...input.extraMCArgs);
    let args = [...jvm, version.mainClass, ...game];
    if (input.javaMajor >= 9) {
      // Keep session credentials in process arguments, never in the on-disk JVM argument file.
      const argfile = join(temporary, 'jvm.args');
      const quote = (arg: string) =>
        `"${arg.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n').replaceAll('\r', '\\r')}"`;
      await writeFile(argfile, [...jvm, version.mainClass].map(quote).join('\n'), { mode: 0o600 });
      args = [`@${argfile}`, ...game];
    }
    signal.throwIfAborted();
    const child = spawn(input.javaPath, args, {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { process: child, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}
