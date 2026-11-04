export const downloadsEn = {
  'downloads.plugin': 'Download manager',
  'downloads.description':
    'Queue downloads, resume verified partial files, and control concurrency and bandwidth.',
  'downloads.title': 'Download scheduling',
  'downloads.concurrency': 'Concurrent downloads',
  'downloads.limit': 'Total download limit (KiB/s)',
  'downloads.hint':
    '0 means unlimited speed. Limits apply to file downloads across all tasks. Save when games and active tasks have stopped.',
  'downloads.save': 'Save download settings',
  'downloads.pause': 'Pause downloads',
  'downloads.resume': 'Continue downloads',
  'downloads.paused': 'Downloads paused',
  'downloads.queued': 'Waiting for a download slot',
  'downloads.pausedLog': 'Downloads paused. The task and installation remain active.',
  'downloads.resumedLog': 'Downloads continued.',
  'downloads.resumingBytes': 'Resuming a partial download at byte {{bytes}}.',
  'downloads.restartRange':
    'The server cannot continue this partial representation. Downloading the file from the beginning.',
  'downloads.invalidRange':
    'The server returned an invalid range, changed validator, or encoded download. The partial file was discarded.',
  'downloads.invalidPartial': 'The download cache contains an invalid file or link.',
  'downloads.incomplete':
    'The download ended before the declared file length was received. Retry the task to continue it.',
  'downloads.invalidConfiguration':
    'Concurrency must be an integer from 1 to 32; speed must be a whole number from 0 to 1048576 KiB/s.',
  'downloads.taskRequired': 'File downloads must run inside a Host task.',
  'downloads.cleanupFailed':
    'The file was saved, but its download cache could not be removed: {{message}}',
  'tasks.pauseUnavailable': 'This task is not currently in a pausable download stage.',
};

export const downloadsZh: Record<keyof typeof downloadsEn, string> = {
  'downloads.plugin': '下载管理',
  'downloads.description': '调度下载队列、续传已校验身份的文件片段，并控制并发与带宽。',
  'downloads.title': '下载调度',
  'downloads.concurrency': '并发下载数',
  'downloads.limit': '下载总限速（KiB/s）',
  'downloads.hint':
    '0 表示不限速。限制作用于所有任务的文件下载。请在游戏与活动任务结束后保存设置。',
  'downloads.save': '保存下载设置',
  'downloads.pause': '暂停下载',
  'downloads.resume': '继续下载',
  'downloads.paused': '下载已暂停',
  'downloads.queued': '等待下载名额',
  'downloads.pausedLog': '已暂停下载，任务与安装流程保持活动状态。',
  'downloads.resumedLog': '已继续下载。',
  'downloads.resumingBytes': '正在从第 {{bytes}} 字节继续下载文件片段。',
  'downloads.restartRange': '服务器无法继续此文件片段，正在从头下载该文件。',
  'downloads.invalidRange':
    '服务器返回了无效范围、已改变的验证标识或经过编码的下载。已丢弃文件片段。',
  'downloads.invalidPartial': '下载缓存包含无效文件或链接。',
  'downloads.incomplete': '下载在达到声明的文件长度前结束，请重试任务继续下载。',
  'downloads.invalidConfiguration':
    '并发数须为 1 到 32 的整数，限速须为 0 到 1048576 KiB/s 的整数。',
  'downloads.taskRequired': '文件下载必须在 Host 任务中执行。',
  'downloads.cleanupFailed': '文件已保存，但未能移除其下载缓存：{{message}}',
  'tasks.pauseUnavailable': '此任务目前不在可暂停的下载阶段。',
};
