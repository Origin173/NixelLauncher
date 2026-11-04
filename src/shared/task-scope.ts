import { AsyncLocalStorage } from 'node:async_hooks';
import type { ProviderRegistry, TaskContext } from './host-api';

/** Host-only async execution context; never imported by the renderer. */
export const taskScope = new AsyncLocalStorage<{
  task: TaskContext;
  providers: ProviderRegistry;
}>();
