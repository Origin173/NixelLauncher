import type { CurseForgePackFile } from '../providers';
export interface MrpackIndex {
  formatVersion: 1;
  game: 'minecraft';
  versionId: string;
  name: string;
  summary?: string;
  dependencies: Record<string, string>;
  files: {
    path: string;
    hashes: Record<string, string>;
    downloads: string[];
    fileSize: number;
    env?: { client?: string; server?: string };
  }[];
}

export interface CurseForgeManifest {
  manifestType: 'minecraftModpack';
  manifestVersion: 1;
  name: string;
  version: string;
  minecraft: { version: string; modLoaders: { id: string; primary?: boolean }[] };
  files: CurseForgePackFile[];
  overrides?: string;
}
