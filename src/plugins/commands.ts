import type { Context } from 'cordis';

export function commandsFor(ctx: Context) {
  return <P = void, R = unknown>(name: string, handler: (params: P) => R | Promise<R>) =>
    ctx.nixel.commands.register(ctx, name, handler);
}
