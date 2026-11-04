import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { link, lstat, mkdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Context } from 'cordis';
import type { ContentCategory } from '../../shared/contracts';
import { tr } from '../../shared/i18n';
import { commandsFor } from '../commands';
import { inside } from '../files';
import { assertInstanceIdle, getInstance } from '../instance-state';
import { contentDirectories, scanContent } from '../resource-files';
export function registerContentImport(ctx: Context) {
  const host = ctx.nixel;
  const command = commandsFor(ctx);
  command(
    'content.import',
    ({
      instanceId,
      category,
      paths,
    }: {
      instanceId: string;
      category: ContentCategory;
      paths: string[];
    }) => {
      const instance = getInstance(host, instanceId);
      assertInstanceIdle(host, instanceId);
      if (!Object.hasOwn(contentDirectories, category) || !Array.isArray(paths) || !paths.length)
        throw new Error(tr('resources.chooseAContentTypeAndLocalFiles'));
      return {
        taskId: host.tasks.start(
          tr('resources.importLocalContent'),
          tr('resources.copyingLocalFiles'),
          async (task) => {
            assertInstanceIdle(host, instanceId, task.taskId);
            const directory = join(instance.directory, contentDirectories[category]);
            await mkdir(directory, { recursive: true });
            const imported: string[] = [];
            const staged: string[] = [];
            try {
              const names = new Set<string>();
              const files = [];
              for (const path of paths) {
                const name = basename(path);
                const extension = category === 'mods' ? /\.jar$/i : /\.zip$/i;
                if (!extension.test(name) || !(await lstat(path)).isFile())
                  throw new Error(tr('resources.unsupportedLocalFileValue', { value1: name }));
                const target = inside(directory, name);
                if (
                  names.has(name.toLowerCase()) ||
                  (await lstat(target).then(
                    () => true,
                    () => false,
                  ))
                )
                  throw new Error(
                    tr('resources.fileAlreadyExistsRemoveOrRenameIt', { value1: name }),
                  );
                names.add(name.toLowerCase());
                files.push({ path, target, name });
              }
              for (const [index, file] of files.entries()) {
                task.signal.throwIfAborted();
                const temporary = join(directory, `.nixel-${randomUUID()}.part`);
                staged.push(temporary);
                await pipeline(
                  createReadStream(file.path),
                  createWriteStream(temporary, { flags: 'wx' }),
                  { signal: task.signal },
                );
                // Creating the final hard link fails on collisions without replacing user files.
                await link(temporary, file.target);
                imported.push(file.target);
                task.report(
                  ((index + 1) / files.length) * 100,
                  tr('resources.importValue', { value1: file.name }),
                );
              }
              task.signal.throwIfAborted();
              await scanContent(host, instance);
              task.log(tr('resources.importedValueLocalFiles', { value1: files.length }));
            } catch (error) {
              await Promise.all(imported.map((path) => rm(path, { force: true })));
              throw error;
            } finally {
              await Promise.all(staged.map((path) => rm(path, { force: true })));
            }
          },
          {
            instanceId,
            kind: 'resource',
            retry: { command: 'content.import', params: { instanceId, category, paths } },
          },
        ),
      };
    },
  );
}
