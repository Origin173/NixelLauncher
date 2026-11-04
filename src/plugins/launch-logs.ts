import { appendFile, writeFile } from 'node:fs/promises';
import type { TaskContext } from '../shared/host-api';
import { tr } from '../shared/i18n';

const recent = new Map<string, string[]>();
export function recentLaunchLog(id: string) {
  return recent.get(id);
}

export function redactLog(text: string, token?: string) {
  if (token && token.length > 8) text = text.replaceAll(token, '[REDACTED]');
  return text.replace(
    /((?:access[_-]?token|refresh[_-]?token|clientToken)["']?\s*(?:[:=]\s*["']?|\s+))[^\s,"'}]+/gi,
    '$1[REDACTED]',
  );
}

export async function createLaunchLog(
  id: string,
  logPath: string,
  task: TaskContext,
  token: string,
) {
  await writeFile(logPath, '', 'utf8');
  const lines: string[] = [];
  recent.set(id, lines);
  let logWrites = Promise.resolve();
  let logWriteFailed = false;
  const capture = (text: string) => {
    const line = redactLog(text, token);
    lines.push(line);
    if (lines.length > 2000) lines.splice(0, lines.length - 2000);
    task.log(line);
    logWrites = logWrites
      .then(() => appendFile(logPath, `${line}\n`, 'utf8'))
      .catch((error) => {
        if (!logWriteFailed)
          task.log(tr('game.couldNotWriteTheLaunchLogValue', { value1: String(error) }));
        logWriteFailed = true;
      });
  };

  return { capture, flush: () => logWrites };
}
