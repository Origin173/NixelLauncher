/** Validate the options shared by global settings and per-instance overrides. */
export function validateLaunchOptions(
  input: { jvmArgs?: unknown; gameArgs?: unknown; resolution?: unknown; fullscreen?: unknown },
  allowInherit = false,
) {
  for (const key of ['jvmArgs', 'gameArgs'] as const) {
    const value = input[key];
    if (value === undefined || (value === null && allowInherit)) continue;
    if (
      !Array.isArray(value) ||
      value.some((arg) => typeof arg !== 'string' || /[\0\r\n]/.test(arg))
    )
      throw new Error('启动参数需要逐项填写，每行一个参数');
  }
  const resolution = input.resolution;
  if (resolution !== undefined && !(resolution === null && allowInherit)) {
    const size = resolution as { width?: number; height?: number } | null;
    if (
      !size ||
      !Number.isInteger(size.width) ||
      !Number.isInteger(size.height) ||
      (size.width ?? 0) < 320 ||
      (size.height ?? 0) < 240 ||
      (size.width ?? 0) > 16384 ||
      (size.height ?? 0) > 16384
    )
      throw new Error('窗口宽度需为 320–16384，高度需为 240–16384 的整数');
  }
  if (
    input.fullscreen !== undefined &&
    !(input.fullscreen === null && allowInherit) &&
    typeof input.fullscreen !== 'boolean'
  )
    throw new Error('全屏选项无效');
}
