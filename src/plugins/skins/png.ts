import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { PNG } from 'pngjs';
import { tr } from '../../shared/i18n';

const maximumSize = 16 * 1024;
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export async function readSkinFile(path: string, signal?: AbortSignal) {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error(tr('skins.invalidPng'));
  const file = await open(path, 'r');
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size < 33 || info.size > maximumSize)
      throw new Error(tr('skins.invalidPng'));
    signal?.throwIfAborted();
    const bytes = Buffer.alloc(maximumSize + 1);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    const png = bytes.subarray(0, bytesRead);
    if (
      bytesRead < 33 ||
      bytesRead > maximumSize ||
      !png.subarray(0, 8).equals(signature) ||
      png.toString('ascii', 12, 16) !== 'IHDR' ||
      png.readUInt32BE(16) !== 64 ||
      ![32, 64].includes(png.readUInt32BE(20))
    )
      throw new Error(tr('skins.invalidPng'));
    try {
      PNG.sync.read(png, { checkCRC: true });
    } catch {
      throw new Error(tr('skins.invalidPng'));
    }
    signal?.throwIfAborted();
    return {
      bytes: png,
      path,
      dataUrl: `data:image/png;base64,${png.toString('base64')}`,
      sha256: createHash('sha256').update(png).digest('hex'),
      height: png.readUInt32BE(20),
    };
  } finally {
    await file.close();
  }
}
