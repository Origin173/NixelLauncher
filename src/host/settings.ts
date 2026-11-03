import { stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type { LauncherSettings } from '../shared/contracts';
import { validateLaunchOptions } from '../shared/launch-options';
import type { NixelService } from './core';

export async function validateSettings(host: NixelService, input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('设置格式无效。');
  const patch = input as Partial<LauncherSettings>;
  const state = host.store.read();
  validateLaunchOptions(patch);
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(state.settings, key)) throw new Error(`未知设置：${key}`);
    if (typeof value !== typeof state.settings[key as keyof LauncherSettings]) {
      throw new Error(`设置类型无效：${key}`);
    }
  }
  if (patch.theme && !['light', 'dark', 'system'].includes(patch.theme))
    throw new Error('主题无效。');
  for (const [key, min, max] of [
    ['dim', 0, 100],
    ['memory', 256, 262144],
    ['downloadConcurrency', 1, 32],
  ] as const) {
    const value = patch[key];
    if (value !== undefined && (!Number.isFinite(value) || value < min || value > max)) {
      throw new Error(`${key} 需介于 ${min} 与 ${max} 之间。`);
    }
  }
  if (patch.instanceDirectory !== undefined) {
    if (!isAbsolute(patch.instanceDirectory)) throw new Error('实例目录必须是绝对路径。');
    if (!(await stat(patch.instanceDirectory)).isDirectory()) throw new Error('实例目录不存在。');
  }
  if (patch.javaPath) {
    if (!isAbsolute(patch.javaPath) || !(await stat(patch.javaPath)).isFile()) {
      throw new Error('Java 可执行文件不存在。');
    }
  }
  for (const key of ['defaultAccount', 'launchAccount'] as const) {
    if (patch[key] && !state.accounts.some((account) => account.id === patch[key])) {
      throw new Error('所选账号不存在。');
    }
  }
  if (
    patch.launchInstance &&
    !state.instances.some((instance) => instance.id === patch.launchInstance)
  ) {
    throw new Error('所选实例不存在。');
  }
  if (patch.providers) {
    for (const key of Object.keys(patch.providers)) {
      if (!['game', 'resources', 'accounts'].includes(key)) throw new Error('服务类型无效。');
    }
    for (const kind of ['game', 'resources', 'accounts'] as const) {
      const id = patch.providers[kind];
      if (id !== undefined) host.providers.get(kind, id);
    }
  }
  return patch;
}
