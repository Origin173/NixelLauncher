import { setTimeout } from 'node:timers/promises';

/** A shared token bucket; aborted waiters do not reserve future bandwidth. */
export class DownloadRateLimit {
  private tokens: number;
  private updated = performance.now();
  private readonly burst: number;

  constructor(private readonly bytesPerSecond: number) {
    this.burst = Math.min(bytesPerSecond, 65536);
    this.tokens = this.burst;
  }

  async consume(bytes: number, signal: AbortSignal) {
    if (!this.bytesPerSecond) return;
    while (bytes > 0) {
      signal.throwIfAborted();
      const size = Math.min(bytes, this.burst);
      const now = performance.now();
      this.tokens = Math.min(
        this.burst,
        this.tokens + ((now - this.updated) / 1000) * this.bytesPerSecond,
      );
      this.updated = now;
      if (this.tokens >= size) {
        this.tokens -= size;
        bytes -= size;
      } else {
        await setTimeout(
          Math.ceil(((size - this.tokens) / this.bytesPerSecond) * 1000),
          undefined,
          { signal },
        );
      }
    }
  }
}
