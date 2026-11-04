import { tr } from '../../shared/i18n';
import type { PluginCatalog } from '../../shared/plugin-distribution';

export function httpsUrl(value: unknown) {
  if (typeof value !== 'string') throw new Error(tr('pluginDist.https'));
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash)
    throw new Error(tr('pluginDist.https'));
  return url.href;
}
export async function readCatalog(source: string, signal?: AbortSignal): Promise<PluginCatalog> {
  const response = await fetch(httpsUrl(source), { signal, redirect: 'error' });
  if (!response.ok)
    throw new Error(
      tr('files.requestFailedValueValue', {
        value1: response.status,
        value2: new URL(source).hostname,
      }),
    );
  if (!response.body) throw new Error(tr('pluginDist.invalidCatalog'));
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) throw new Error(tr('pluginDist.invalidCatalog'));
    chunks.push(chunk);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as PluginCatalog;
  if (value?.formatVersion !== 1 || !Array.isArray(value.packages) || value.packages.length > 1000)
    throw new Error(tr('pluginDist.invalidCatalog'));
  const seen = new Set<string>();
  for (const item of value.packages) {
    if (!item?.manifest || typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(item.sha256))
      throw new Error(tr('pluginDist.invalidCatalog'));
    item.url = httpsUrl(item.url);
    const key = `${item.manifest.id}@${item.manifest.version}`;
    if (seen.has(key)) throw new Error(tr('pluginDist.invalidCatalog'));
    seen.add(key);
  }
  return value;
}
