import {
  type DownloadMirrorConfiguration,
  defaultDownloadMirror,
} from '../../../shared/download-mirrors';
import { tr } from '../../../shared/i18n';

export function mirrorConfiguration(value: unknown): DownloadMirrorConfiguration {
  if (value === undefined) return { ...defaultDownloadMirror };
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(tr('mirrors.invalidConfiguration'));
  const input = value as Record<string, unknown>;
  if (!['official', 'bmclapi', 'custom'].includes(String(input.mode)))
    throw new Error(tr('mirrors.invalidConfiguration'));
  if (input.mode !== 'custom') return { mode: input.mode as 'official' | 'bmclapi', baseUrl: '' };
  let url: URL;
  try {
    url = new URL(String(input.baseUrl));
  } catch {
    throw new Error(tr('mirrors.invalidConfiguration'));
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error(tr('mirrors.invalidConfiguration'));
  return { mode: 'custom', baseUrl: url.origin };
}
