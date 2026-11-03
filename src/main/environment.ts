import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

const keys = ['MICROSOFT_CLIENT_ID', 'CURSEFORGE_API_KEY', 'MODRINTH_TOKEN', 'NIXEL_DATA_DIR'];

export function loadEnvironment(directory: string) {
  const values: Record<string, string> = {};
  for (const name of ['.env', '.env.local']) {
    const path = join(directory, name);
    if (existsSync(path)) Object.assign(values, parseEnv(readFileSync(path, 'utf8')));
  }
  for (const key of keys) {
    if (process.env[key] === undefined && values[key] !== undefined) process.env[key] = values[key];
  }
}
