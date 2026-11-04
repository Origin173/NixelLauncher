export const versionContentEn = {
  'versionContent.chooseActions': 'Choose what to do with each incompatible or unverified item.',
  'versionContent.selectHint':
    'Choose compatible updates from each item’s source. Local and incompatible files can be kept or disabled. Updating a disabled item keeps it disabled.',
  'versionContent.choose': 'Choose an action',
  'versionContent.keep': 'Keep current file',
  'versionContent.disable': 'Disable',
  'versionContent.update': 'Update to a compatible version',
  'versionContent.version': 'Compatible version',
  'versionContent.review': 'Review selected changes',
  'versionContent.confirm': 'Confirm content changes',
  'versionContent.confirmHint':
    'These exact versions and their required dependencies will be downloaded before any installed content is changed.',
  'versionContent.dependency': 'Required dependency',
  'versionContent.disableSummary': 'Will be disabled: {{names}}',
  'versionContent.keepRisks': 'Keeping unverified or incompatible content: {{names}}',
  'versionContent.accept': 'I accept the compatibility and world-version warnings shown above.',
  'versionContent.noDownloads': 'No content downloads are needed.',
  'versionContent.unsupported':
    'The provider {{source}} cannot prepare content updates for a version change.',
  'versionContent.invalidVersion':
    'The selected content version is no longer valid. Review the choices again.',
  'versionContent.pathConflict': 'An unrelated file already uses this target path: {{path}}',
  'versionContent.expired':
    'The saved content plan is unavailable. Review the version change again.',
  'versionContent.staging': 'Preparing {{name}}',
  'versionContent.interrupted':
    'The version change has not committed. If it was interrupted, restore backup {{id}} before launching.',
  'versionContent.rollbackFailed':
    'Some content files could not be restored. Restore backup {{id}} before launching.',
  'versionContent.cleanupFailed':
    'The version change completed, but temporary copies could not be removed: {{error}}',
  'fileTransaction.symlink': 'The file path contains a symbolic link: {{path}}',
  'fileTransaction.notFile': 'The file path points to a directory: {{path}}',
  'fileTransaction.rollbackFailed': 'Some original instance files could not be restored.',
} as const;
export const versionContentZh = {
  'versionContent.chooseActions': '请为每个不兼容或未确认的内容选择处理方式。',
  'versionContent.selectHint':
    '按各内容的实际来源选择兼容版本。本地与不兼容文件可以保留或禁用；更新禁用内容后仍保持禁用。',
  'versionContent.choose': '选择处理方式',
  'versionContent.keep': '保留当前文件',
  'versionContent.disable': '禁用',
  'versionContent.update': '更新至兼容版本',
  'versionContent.version': '兼容版本',
  'versionContent.review': '确认所选内容',
  'versionContent.confirm': '确认内容变更',
  'versionContent.confirmHint': '以下精确版本及其必需依赖会先下载完成，再修改已安装内容。',
  'versionContent.dependency': '必需依赖',
  'versionContent.disableSummary': '将禁用：{{names}}',
  'versionContent.keepRisks': '保留未确认或不兼容内容：{{names}}',
  'versionContent.accept': '我已了解以上兼容性与存档版本风险。',
  'versionContent.noDownloads': '无需下载内容文件。',
  'versionContent.unsupported': '提供者 {{source}} 不支持为版本变更准备内容更新。',
  'versionContent.invalidVersion': '所选内容版本已不可用，请重新确认。',
  'versionContent.pathConflict': '目标路径已被其他文件占用：{{path}}',
  'versionContent.expired': '保存的内容计划不可用，请重新确认版本变更。',
  'versionContent.staging': '正在准备 {{name}}',
  'versionContent.interrupted': '版本变更尚未提交；若进程中断，请在启动前恢复备份 {{id}}。',
  'versionContent.rollbackFailed': '部分内容文件无法还原，请在启动前恢复备份 {{id}}。',
  'versionContent.cleanupFailed': '版本变更已完成，但临时副本清理失败：{{error}}',
  'fileTransaction.symlink': '文件路径包含符号链接：{{path}}',
  'fileTransaction.notFile': '文件路径指向目录：{{path}}',
  'fileTransaction.rollbackFailed': '部分实例原始文件无法还原。',
} satisfies Record<keyof typeof versionContentEn, string>;
