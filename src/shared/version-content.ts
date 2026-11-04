import type { ContentCategory, InstanceVersionTarget } from './contracts';
export type VersionContentChoice =
  | { action: 'keep' | 'disable' }
  | { action: 'update'; versionId: string };
export interface VersionContentPlanInput {
  id: string;
  target: InstanceVersionTarget;
  fingerprint: string;
  choices: Record<string, VersionContentChoice>;
}
export interface VersionContentRoot {
  projectId: string;
  versionId: string;
  enabled: boolean;
}
export interface VersionContentFileReview {
  source: string;
  projectId: string;
  versionId: string;
  name: string;
  version: string;
  fileName: string;
  category: ContentCategory;
  enabled: boolean;
  dependency: boolean;
}
export interface VersionContentPlan {
  id: string;
  instanceId: string;
  target: InstanceVersionTarget;
  fingerprint: string;
  files: VersionContentFileReview[];
  disabled: { id: string; name: string }[];
  retainedRisks: { id: string; name: string }[];
  minecraftChanged: boolean;
}
