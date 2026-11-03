import { tr } from './i18n';
export function errorMessage(error: unknown): string {
  if (error instanceof AggregateError) {
    const details = error.errors.slice(0, 3).map(errorMessage);
    if (error.errors.length > 3)
      details.push(tr('error-message.valueMoreFailures', { value1: error.errors.length - 3 }));
    return (
      [error.message, ...details].filter(Boolean).join('\n') || tr('error-message.operationFailed')
    );
  }
  return error instanceof Error ? error.message || error.name : String(error);
}
