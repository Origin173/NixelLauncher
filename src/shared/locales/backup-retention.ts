export const backupRetentionEn = {
  'backupRetention.title': 'Backup retention',
  'backupRetention.count': 'Automatic backups per instance',
  'backupRetention.description':
    '0 keeps all backups. After a new version-change or modpack-upgrade backup succeeds, older automatic backups beyond this limit are deleted. Manual backups and backups from older launcher versions are always kept. Backups being restored are skipped.',
  'backupRetention.invalidCount': 'Enter a whole number from 0 to 1000.',
  'backupRetention.save': 'Save retention policy',
  'backupRetention.manual': 'Manual or legacy backup',
  'backupRetention.automatic': 'Before version change',
  'backupRetention.modpack': 'Before modpack upgrade',
  'backupRetention.removed': 'Retention cleanup deleted automatic backup {{id}}.',
  'backupRetention.skipped': 'Retention cleanup kept busy backup {{id}}.',
  'backupRetention.failed': 'Backup saved, but retention cleanup failed: {{error}}',
  'backupRetention.keywords': 'backup retention automatic cleanup directory files data',
};

export const backupRetentionZh = {
  'backupRetention.title': '备份保留策略',
  'backupRetention.count': '每个实例保留的自动备份数',
  'backupRetention.description':
    '0 表示全部保留。更换版本或升级整合包前的新备份成功后，自动删除超出数量的旧自动备份。手动备份与旧版启动器创建的备份始终保留，正在恢复的备份会跳过。',
  'backupRetention.invalidCount': '请输入 0 到 1000 之间的整数。',
  'backupRetention.save': '保存保留策略',
  'backupRetention.manual': '手动或旧版备份',
  'backupRetention.automatic': '更换版本前的备份',
  'backupRetention.modpack': '整合包升级前的备份',
  'backupRetention.removed': '保留策略已删除自动备份 {{id}}。',
  'backupRetention.skipped': '保留策略已跳过正在使用的备份 {{id}}。',
  'backupRetention.failed': '备份已保存，但历史备份清理失败：{{error}}',
  'backupRetention.keywords': '备份 保留 自动 清理 目录 文件 数据',
};
