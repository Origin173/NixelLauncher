import type { Loader } from './contracts';

export type DiagnosticCode =
  | 'memory'
  | 'java-missing'
  | 'java-version'
  | 'dependencies'
  | 'mixin'
  | 'native';

export interface DiagnosticSource {
  name: string;
  modifiedAt: string;
  text: string;
  /** Only the final bounded excerpt is included; line numbers refer to this text. */
  truncated: boolean;
}
export interface DiagnosticFinding {
  code: DiagnosticCode;
  evidence: { source: string; line: number; text: string }[];
  /** Filename mentions in evidence, not a claim that these mods caused the failure. */
  relatedFiles: string[];
}
export interface DiagnosticReport {
  createdAt: string;
  instance: {
    name: string;
    version: string;
    loader: Loader;
    loaderVersion?: string;
    memory: number;
  };
  content: {
    name: string;
    version: string;
    fileName: string;
    enabled: boolean;
    source?: string;
    projectId?: string;
    versionId?: string;
  }[];
  sources: DiagnosticSource[];
  findings: DiagnosticFinding[];
  warnings: string[];
}
