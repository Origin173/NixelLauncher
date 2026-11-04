import { tr } from './i18n';

const maxDepth = 8;
const maxNodes = 32;

function errorCodes(error: unknown): string[] {
  const codes = new Set<string>();
  const seen = new Set<object>();
  const pending = [{ value: error, depth: 0 }];
  for (const { value, depth } of pending) {
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    const entry = value as { code?: unknown; cause?: unknown };
    if (typeof entry.code === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(entry.code))
      codes.add(entry.code);
    if (depth >= maxDepth) continue;
    if (entry.cause !== undefined && pending.length < maxNodes)
      pending.push({ value: entry.cause, depth: depth + 1 });
    if (value instanceof AggregateError) {
      for (const nested of value.errors.slice(0, maxNodes - pending.length))
        pending.push({ value: nested, depth: depth + 1 });
    }
  }
  return [...codes];
}

export function errorMessage(error: unknown): string {
  const seen = new Set<AggregateError>();
  let nodes = 0;
  function message(value: unknown, depth: number): string {
    if (depth > maxDepth || nodes++ >= maxNodes) return '';
    if (value instanceof AggregateError) {
      if (seen.has(value)) return '';
      seen.add(value);
      const details = value.errors.slice(0, 3).map((nested) => message(nested, depth + 1));
      if (value.errors.length > 3)
        details.push(tr('error-message.valueMoreFailures', { value1: value.errors.length - 3 }));
      const result =
        [value.message, ...details].filter(Boolean).join('\n') ||
        tr('error-message.operationFailed');
      seen.delete(value);
      return result;
    }
    return value instanceof Error ? value.message || value.name : String(value);
  }
  const text = message(error, 0);
  const codes = errorCodes(error).filter(
    (code) => !new RegExp(`(^|[^A-Z0-9_])${code}([^A-Z0-9_]|$)`).test(text),
  );
  return codes.length ? `${text} (${codes.join(', ')})` : text;
}
