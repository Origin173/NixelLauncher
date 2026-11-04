import { randomUUID } from 'node:crypto';
import { copyFile, lstat, mkdir, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tr } from '../shared/i18n';
import { inside } from './files';

/** Validate existing ancestors before reading or modifying an instance file. */
export async function checkedPath(root: string, path: string) {
  const target = inside(root, path);
  if ((await lstat(root)).isSymbolicLink())
    throw new Error(tr('fileTransaction.symlink', { path }));
  let current = root;
  for (const part of path.split('/')) {
    current = join(current, part);
    const info = await lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (info?.isSymbolicLink()) throw new Error(tr('fileTransaction.symlink', { path }));
    if (info && current === target && !info.isFile())
      throw new Error(tr('fileTransaction.notFile', { path }));
  }
  return target;
}

/** A short file commit with original copies; metadata remains the caller's responsibility. */
export class FileTransaction {
  private readonly originals = new Map<string, boolean>();
  constructor(
    private readonly root: string,
    private readonly rollbackRoot: string,
  ) {}
  async write(path: string, source?: string) {
    const target = await checkedPath(this.root, path);
    if (!this.originals.has(path)) {
      const existed = await lstat(target).then(
        () => true,
        (error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return false;
          throw error;
        },
      );
      if (existed) {
        const original = inside(this.rollbackRoot, path);
        await mkdir(dirname(original), { recursive: true });
        await copyFile(target, original);
      }
      this.originals.set(path, existed);
    }
    if (source) {
      await mkdir(dirname(target), { recursive: true });
      const temporary = `${target}.${randomUUID()}.nixel-update`;
      try {
        await copyFile(source, temporary);
        await rename(temporary, target);
      } finally {
        await rm(temporary, { force: true });
      }
    } else await rm(target, { force: true });
  }
  async rollback() {
    const failures: unknown[] = [];
    for (const [path, existed] of [...this.originals].reverse()) {
      try {
        const target = await checkedPath(this.root, path);
        if (existed) await copyFile(inside(this.rollbackRoot, path), target);
        else await rm(target, { force: true });
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length) throw new AggregateError(failures, tr('fileTransaction.rollbackFailed'));
  }
}
