import { randomBytes } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import { isIP, Socket } from 'node:net';
import { tr } from '../../shared/i18n';
import { parseServerAddress, type ServerAddress, type ServerStatus } from '../../shared/servers';

const maximumPacket = 128 * 1024;
function invalid(): never {
  throw new Error(tr('servers.invalidResponse'));
}
function varInt(value: number) {
  const bytes: number[] = [];
  do {
    const byte = value & 0x7f;
    value >>>= 7;
    bytes.push(byte | (value ? 0x80 : 0));
  } while (value);
  return Buffer.from(bytes);
}
function readVarInt(buffer: Buffer, start = 0) {
  let value = 0;
  for (let index = 0; index < 5; index++) {
    if (start + index >= buffer.length) return null;
    const byte = buffer.readUInt8(start + index);
    if (index === 4 && byte > 15) invalid();
    value |= (byte & 0x7f) << (index * 7);
    if (!(byte & 0x80)) return { value, end: start + index + 1 };
  }
  return invalid();
}
function packet(...parts: Buffer[]) {
  const data = Buffer.concat(parts);
  return Buffer.concat([varInt(data.length), data]);
}
function text(value: unknown, depth = 0): string {
  if (depth > 16) return '';
  if (typeof value === 'string') return value.slice(0, 2048);
  if (Array.isArray(value))
    return value
      .map((part) => text(part, depth + 1))
      .join('')
      .slice(0, 2048);
  if (value && typeof value === 'object') {
    const component = value as { text?: unknown; extra?: unknown; translate?: unknown };
    return `${text(component.text ?? component.translate, depth + 1)}${text(component.extra, depth + 1)}`.slice(
      0,
      2048,
    );
  }
  return '';
}
function parseStatus(value: unknown): Omit<ServerStatus, 'latency' | 'checkedAt'> {
  if (!value || typeof value !== 'object') invalid();
  const data = value as {
    version?: { name?: unknown };
    players?: { online?: unknown; max?: unknown };
    description?: unknown;
  };
  if (
    typeof data.version?.name !== 'string' ||
    typeof data.players?.online !== 'number' ||
    !Number.isSafeInteger(data.players.online) ||
    data.players.online < 0 ||
    typeof data.players.max !== 'number' ||
    !Number.isSafeInteger(data.players.max) ||
    data.players.max < 0
  )
    invalid();
  return {
    version: data.version.name.slice(0, 256),
    online: data.players.online,
    maximum: data.players.max,
    description: text(data.description).replace(/§[0-9a-fk-or]/gi, ''),
  };
}

async function destination(address: ServerAddress, signal: AbortSignal) {
  if (address.explicitPort || isIP(address.host)) return address;
  const resolver = new Resolver();
  const cancel = () => resolver.cancel();
  signal.addEventListener('abort', cancel, { once: true });
  try {
    signal.throwIfAborted();
    const records = await resolver.resolveSrv(`_minecraft._tcp.${address.host}`);
    if (!records.length) return address;
    const priority = Math.min(...records.map((record) => record.priority));
    const candidates = records
      .filter((record) => record.priority === priority)
      .sort((a, b) => a.weight - b.weight);
    let weight = Math.floor(
      Math.random() * (candidates.reduce((sum, record) => sum + record.weight, 0) + 1),
    );
    const selected =
      candidates.find((record) => {
        weight -= record.weight;
        return weight <= 0;
      }) ?? candidates[0];
    if (!selected?.name || selected.name === '.') throw new Error(tr('servers.unavailable'));
    return parseServerAddress(`${selected.name}:${selected.port}`);
  } catch (error) {
    signal.throwIfAborted();
    if (['ENODATA', 'ENOTFOUND'].includes((error as NodeJS.ErrnoException).code ?? ''))
      return address;
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}

export async function queryServer(value: string, cancellation: AbortSignal): Promise<ServerStatus> {
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(new Error(tr('servers.timeout'))), 8000);
  const signal = AbortSignal.any([cancellation, deadline.signal]);
  try {
    signal.throwIfAborted();
    const address = parseServerAddress(value);
    const target = await destination(address, signal);
    signal.throwIfAborted();
    return await new Promise<ServerStatus>((resolve, reject) => {
      const socket = new Socket();
      let buffer: Buffer = Buffer.alloc(0);
      let status: Omit<ServerStatus, 'latency' | 'checkedAt'> | undefined;
      let pingTime = 0;
      let finished = false;
      const ping = randomBytes(8);
      const finish = (error?: Error, result?: ServerStatus) => {
        if (finished) return;
        finished = true;
        signal.removeEventListener('abort', abort);
        socket.destroy();
        if (error) reject(error);
        else if (result) resolve(result);
      };
      const abort = () => finish(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      socket.on('error', (error) => finish(error));
      socket.on('close', () => finish(new Error(tr('servers.closed'))));
      socket.on('connect', () => {
        const hostname = Buffer.from(address.host);
        const port = Buffer.alloc(2);
        port.writeUInt16BE(target.port);
        socket.write(
          packet(varInt(0), varInt(-1), varInt(hostname.length), hostname, port, varInt(1)),
        );
        socket.write(packet(varInt(0)));
      });
      socket.on('data', (chunk: Buffer) => {
        try {
          if (buffer.length + chunk.length > maximumPacket + 5) invalid();
          buffer = Buffer.concat([buffer, chunk]);
          while (buffer.length && !finished) {
            const length = readVarInt(buffer);
            if (!length) break;
            if (length.value < 1 || length.value > maximumPacket) invalid();
            if (buffer.length < length.end + length.value) break;
            const body = buffer.subarray(length.end, length.end + length.value);
            buffer = buffer.subarray(length.end + length.value);
            const id = readVarInt(body);
            if (!id) invalid();
            if (!status) {
              if (id.value !== 0) invalid();
              const size = readVarInt(body, id.end);
              if (!size || size.value < 0 || size.end + size.value !== body.length) invalid();
              status = parseStatus(JSON.parse(body.subarray(size.end).toString('utf8')));
              pingTime = performance.now();
              socket.write(packet(varInt(1), ping));
            } else {
              if (id.value !== 1 || !body.subarray(id.end).equals(ping)) invalid();
              finish(undefined, {
                ...status,
                latency: Math.round(performance.now() - pingTime),
                checkedAt: new Date().toISOString(),
              });
            }
          }
        } catch (error) {
          finish(
            error instanceof SyntaxError
              ? new Error(tr('servers.invalidResponse'))
              : (error as Error),
          );
        }
      });
      socket.connect(target.port, target.host);
    });
  } finally {
    clearTimeout(timer);
  }
}
