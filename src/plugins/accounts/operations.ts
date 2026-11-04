import type { NixelHost } from '../../shared/host-api';

const queues = new WeakMap<NixelHost, Map<string, Promise<unknown>>>();

/** Serialize credential changes and removal for one saved identity. */
export async function accountOperation<T>(host: NixelHost, id: string, run: () => Promise<T>) {
  let queue = queues.get(host);
  if (!queue) {
    queue = new Map();
    queues.set(host, queue);
  }
  const previous = queue.get(id);
  const current = previous ? previous.then(run, run) : Promise.resolve().then(run);
  queue.set(id, current);
  try {
    return await current;
  } finally {
    if (queue.get(id) === current) queue.delete(id);
  }
}
