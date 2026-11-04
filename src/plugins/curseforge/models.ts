export interface CurseForgeClass {
  id: number;
  slug: string;
  name: string;
}
export interface CurseForgeProject {
  id: number;
  classId: number;
  name: string;
  summary: string;
  slug: string;
  downloadCount: number;
  authors: { name: string }[];
  logo?: { thumbnailUrl: string };
  links: { websiteUrl: string };
  allowModDistribution: boolean | null;
  isAvailable: boolean;
  latestFiles: { gameVersions: string[] }[];
  screenshots: { url: string; title: string; description: string }[];
}
export interface CurseForgeFile {
  id: number;
  modId: number;
  displayName: string;
  fileName: string;
  fileDate: string;
  fileLength: number;
  isAvailable: boolean;
  isServerPack?: boolean;
  downloadUrl: string | null;
  gameVersions: string[];
  hashes: { value: string; algo: number }[];
  dependencies: { modId: number; relationType: number }[];
}
export interface ApiResponse<T> {
  data: T;
  pagination?: { totalCount: number; resultCount: number; index: number; pageSize: number };
}
