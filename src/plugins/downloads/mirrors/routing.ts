import { bmclapiOrigin, type DownloadMirrorConfiguration } from '../../../shared/download-mirrors';
import type { DownloadRequest } from '../../../shared/downloads';

/** Only documented public artifact paths with an independent expected hash are eligible. */
export function routeDownload(request: DownloadRequest, config: DownloadMirrorConfiguration) {
  const url = new URL(request.url);
  const verified = Object.entries(request.hashes ?? {}).some(
    ([algorithm, value]) =>
      ({ sha1: 40, sha256: 64, sha512: 128 })[algorithm] === value.length &&
      /^[a-f0-9]+$/i.test(value),
  );
  if (
    !verified ||
    url.protocol !== 'https:' ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    return undefined;
  let path: string;
  let category: 'assets' | 'libraries' | 'objects';
  if (
    url.hostname === 'resources.download.minecraft.net' &&
    /^\/[a-f0-9]{2}\/[a-f0-9]{40}$/.test(url.pathname) &&
    url.pathname.slice(1, 3) === url.pathname.slice(4, 6)
  ) {
    path = `/assets${url.pathname}`;
    category = 'assets';
  } else if (
    url.hostname === 'libraries.minecraft.net' &&
    /^\/(?:[A-Za-z0-9_.+-]+\/)+[A-Za-z0-9_.+-]+\.(?:jar|zip)$/.test(url.pathname)
  ) {
    path = `/maven${url.pathname}`;
    category = 'libraries';
  } else if (
    ['launcher.mojang.com', 'piston-data.mojang.com'].includes(url.hostname) &&
    /^\/v1\/objects\/[a-f0-9]{40}\/[A-Za-z0-9_.+-]+$/.test(url.pathname)
  ) {
    path = url.pathname;
    category = 'objects';
  } else return undefined;
  const origin = config.mode === 'bmclapi' ? bmclapiOrigin : config.baseUrl;
  return {
    url: config.mode === 'official' ? request.url : `${origin}${path}`,
    category,
    source: config.mode === 'official' ? 'official' : new URL(origin).host,
  };
}
