import { stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type { LauncherSettings } from '../shared/contracts';
import { tr } from '../shared/i18n';
import { validateLaunchOptions } from '../shared/launch-options';
import type { NixelService } from './core';

export async function validateSettings(host: NixelService, input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error(tr('settings.invalidSettingsFormat'));
  const patch = input as Partial<LauncherSettings>;
  const state = host.store.read();
  if (patch.locale && !['system', 'zh-CN', 'en-US'].includes(patch.locale))
    throw new Error(tr('settings.invalidLanguage'));
  validateLaunchOptions(patch);
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(state.settings, key))
      throw new Error(tr('settings.unknownSettingValue', { value1: key }));
    if (typeof value !== typeof state.settings[key as keyof LauncherSettings]) {
      throw new Error(tr('settings.invalidSettingTypeValue', { value1: key }));
    }
  }
  if (patch.theme && !['light', 'dark', 'system'].includes(patch.theme))
    throw new Error(tr('settings.invalidTheme'));
  for (const [key, min, max] of [
    ['dim', 0, 100],
    ['memory', 256, 262144],
    ['downloadConcurrency', 1, 32],
  ] as const) {
    const value = patch[key];
    if (value !== undefined && (!Number.isFinite(value) || value < min || value > max)) {
      throw new Error(
        tr('settings.valueMustBeBetweenValueAndValue', { value1: key, value2: min, value3: max }),
      );
    }
  }
  if (patch.instanceDirectory !== undefined) {
    if (!isAbsolute(patch.instanceDirectory))
      throw new Error(tr('settings.theInstanceDirectoryMustBeAnAbsolute'));
    if (!(await stat(patch.instanceDirectory)).isDirectory())
      throw new Error(tr('settings.theInstanceDirectoryDoesNotExist'));
  }
  if (patch.javaPath) {
    if (!isAbsolute(patch.javaPath) || !(await stat(patch.javaPath)).isFile()) {
      throw new Error(tr('settings.theJavaExecutableDoesNotExist'));
    }
  }
  for (const key of ['defaultAccount', 'launchAccount'] as const) {
    if (patch[key] && !state.accounts.some((account) => account.id === patch[key])) {
      throw new Error(tr('settings.theSelectedAccountDoesNotExist'));
    }
  }
  if (
    patch.launchInstance &&
    !state.instances.some((instance) => instance.id === patch.launchInstance)
  ) {
    throw new Error(tr('settings.theSelectedInstanceDoesNotExist'));
  }
  if (patch.providers) {
    for (const key of Object.keys(patch.providers)) {
      if (!['game', 'resources', 'accounts'].includes(key))
        throw new Error(tr('settings.invalidServiceType'));
    }
    for (const kind of ['game', 'resources', 'accounts'] as const) {
      const id = patch.providers[kind];
      if (id !== undefined) host.providers.get(kind, id);
    }
  }
  return patch;
}
