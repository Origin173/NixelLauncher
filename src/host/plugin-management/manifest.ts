import { access, readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { valid, validRange } from 'semver';
import type { NixelPluginManifest } from '../../shared/contracts';
import { tr } from '../../shared/i18n';

const ajv = new Ajv({ allErrors: true, strict: false, addUsedSchema: false });
addFormats(ajv);
export function dependencies(manifest: NixelPluginManifest): Record<string, string> {
  return Array.isArray(manifest.dependencies)
    ? Object.fromEntries(manifest.dependencies.map((id) => [id, '*']))
    : (manifest.dependencies ?? {});
}
const pluginId = /^[a-z0-9][a-z0-9._-]+$/i;
export function validateManifest(input: unknown): NixelPluginManifest {
  const fail = () => {
    throw new Error(tr('pluginDist.invalidManifest'));
  };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail();
  const value = input as NixelPluginManifest;
  if (
    value.apiVersion !== 1 ||
    typeof value.id !== 'string' ||
    !pluginId.test(value.id) ||
    typeof value.name !== 'string' ||
    typeof value.description !== 'string' ||
    typeof value.category !== 'string' ||
    typeof value.version !== 'string' ||
    !valid(value.version) ||
    (!value.main && !value.renderer)
  )
    return fail();
  for (const entry of [value.main, value.renderer]) {
    if (
      entry !== undefined &&
      (typeof entry !== 'string' ||
        !entry ||
        isAbsolute(entry) ||
        entry.includes('\\') ||
        entry.includes(':') ||
        entry.split('/').some((part) => !part || part === '..' || part === '.'))
    )
      return fail();
  }
  if (value.dependencies !== undefined) {
    if (!value.dependencies || typeof value.dependencies !== 'object') return fail();
    if (
      Array.isArray(value.dependencies) &&
      value.dependencies.some((id) => typeof id !== 'string')
    )
      return fail();
    for (const [id, range] of Object.entries(dependencies(value))) {
      if (!pluginId.test(id) || typeof range !== 'string' || !validRange(range)) return fail();
    }
  }
  if (value.configSchema !== undefined) {
    const schema = value.configSchema;
    if (
      !schema ||
      typeof schema !== 'object' ||
      Array.isArray(schema) ||
      schema.type !== 'object' ||
      JSON.stringify(schema).length > 65536
    )
      return fail();
    try {
      ajv.compile(schema);
    } catch {
      return fail();
    }
  }
  return value;
}
export function validateConfig(manifest: NixelPluginManifest, config: Record<string, unknown>) {
  if (!manifest.configSchema) return;
  const validate = ajv.compile(manifest.configSchema);
  if (!validate(config))
    throw new Error(tr('pluginDist.invalidConfig', { error: ajv.errorsText(validate.errors) }));
}
export async function entryPath(directory: string, entry: string) {
  if (typeof entry !== 'string' || isAbsolute(entry))
    throw new Error(tr('plugins.thePluginEntryMustBeARelative'));
  const root = await realpath(directory);
  const path = await realpath(resolve(root, entry));
  const relation = relative(root, path);
  if (relation.startsWith('..') || isAbsolute(relation))
    throw new Error(tr('plugins.thePluginEntryIsOutsideItsInstallation'));
  await access(path);
  return path;
}
export async function readManifest(directory: string) {
  const path = join(directory, 'nixel-plugin.json');
  if ((await stat(path)).size > 131072) throw new Error(tr('pluginDist.invalidManifest'));
  const manifest = validateManifest(JSON.parse(await readFile(path, 'utf8')));
  if (manifest.main) await entryPath(directory, manifest.main);
  if (manifest.renderer) await entryPath(directory, manifest.renderer);
  return manifest;
}
