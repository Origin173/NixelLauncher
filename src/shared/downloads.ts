import type { DownloadMirrorConfiguration } from './download-mirrors';
import type { TaskContext } from './host-api';

export const downloadsId = 'nixel.downloads';
export interface DownloadConfiguration {
  concurrency: number;
  /** Aggregate bytes per second; zero is unlimited. */
  bytesPerSecond: number;
  mirror: DownloadMirrorConfiguration;
}
export interface DownloadRequest {
  url: string;
  target: string;
  signal: AbortSignal;
  hashes?: Record<string, string>;
  progress?: (current: number, total: number) => void;
}
export interface DownloadProvider {
  download(request: DownloadRequest, task: TaskContext): Promise<void>;
}
