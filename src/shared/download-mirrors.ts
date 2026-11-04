export interface DownloadMirrorConfiguration {
  mode: 'official' | 'bmclapi' | 'custom';
  baseUrl: string;
}

export const defaultDownloadMirror: DownloadMirrorConfiguration = { mode: 'official', baseUrl: '' };
export const bmclapiOrigin = 'https://bmclapi2.bangbang93.com';
