export function errorMessage(error: unknown): string {
  if (error instanceof AggregateError) {
    const details = error.errors.slice(0, 3).map(errorMessage);
    if (error.errors.length > 3) details.push(`另有 ${error.errors.length - 3} 项失败`);
    return [error.message, ...details].filter(Boolean).join('\n') || '操作失败';
  }
  return error instanceof Error ? error.message || error.name : String(error);
}
