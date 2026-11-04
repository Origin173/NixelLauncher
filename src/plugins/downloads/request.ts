import { tr } from '../../shared/i18n';

/** Check each redirect before issuing it; checking response.url alone is too late. */
export async function fetchDownload(
  url: string,
  signal: AbortSignal,
  headers: Record<string, string>,
) {
  let current = new URL(url);
  for (let redirects = 0; ; redirects++) {
    if (current.protocol !== 'https:' || current.username || current.password)
      throw new Error(tr('files.theDownloadUrlMustUseHttps'));
    const response = await fetch(current, { signal, headers, redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (!location || redirects >= 20) throw new Error(tr('downloads.invalidRedirect'));
    current = new URL(location, current);
  }
}
