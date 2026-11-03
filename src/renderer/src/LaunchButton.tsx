import type { ComponentProps } from 'react';
import { useApp } from './state';
import { Action } from './ui';

export function LaunchButton({
  instanceId,
  accountId,
  ...props
}: {
  instanceId: string;
  accountId?: string;
} & Pick<ComponentProps<typeof Action>, 'size' | 'className' | 'fullWidth'>) {
  const a = useApp();
  const task = a.tasks.find(
    (t) => t.instanceId === instanceId && t.kind === 'launch' && t.status === 'running',
  );
  const running = a.running.includes(instanceId);
  const instance = a.instances.find((entry) => entry.id === instanceId);
  const installTask = a.tasks.find(
    (entry) =>
      entry.instanceId === instanceId && entry.kind === 'install' && entry.status === 'running',
  );
  const needsInstall = instance?.status !== 'ready';
  const busyTask = a.tasks.find(
    (entry) => entry.instanceId === instanceId && entry.status === 'running',
  );
  return (
    <Action
      {...props}
      icon={running ? 'stop' : busyTask ? 'clock' : needsInstall ? 'download' : 'play'}
      isDisabled={Boolean(busyTask) && !running}
      onPress={() => {
        if (needsInstall && !running) {
          a.setLaunchId(instanceId);
          void a.command('instances.install', { id: instanceId });
        } else a.launch(instanceId, accountId);
      }}
    >
      {running
        ? '结束游戏'
        : task
          ? `正在启动 ${Math.round(task.progress)}%`
          : installTask
            ? `正在安装 ${Math.round(installTask.progress)}%`
            : busyTask
              ? `正在处理 ${Math.round(busyTask.progress)}%`
              : needsInstall
                ? '安装游戏'
                : '启动游戏'}
    </Action>
  );
}
