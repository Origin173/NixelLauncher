export const diagnosticsEn = {
  'diagnostics.plugin': 'Crash diagnostics',
  'diagnostics.description':
    'Inspect local failure evidence and export redacted diagnostic archives.',
  'diagnostics.title': 'Local diagnostic report',
  'diagnostics.analyze': 'Analyze logs',
  'diagnostics.export': 'Export diagnostic ZIP',
  'diagnostics.collecting': 'Collecting and redacting local diagnostics…',
  'diagnostics.packing': 'Writing diagnostic archive…',
  'diagnostics.exported': 'Redacted diagnostic archive saved.',
  'diagnostics.scope':
    'Error signatures and their evidence from local logs. Check source dates when comparing different launches.',
  'diagnostics.privacy':
    'Export saves redacted logs and instance details locally. Review the archive before sharing; custom personal text may remain.',
  'diagnostics.empty':
    'No supported error signature was found in the included text. Review the logs and warnings below.',
  'diagnostics.noSources': 'No readable launch log or crash report was found.',
  'diagnostics.sources': 'Included sources',
  'diagnostics.source': '{{name}} · {{date}}',
  'diagnostics.truncated':
    'Only the final 1 MiB is included. Evidence line numbers refer to the included excerpt.',
  'diagnostics.evidence': '{{source}} · included text line {{line}}',
  'diagnostics.related': 'Filenames mentioned in the evidence: {{files}}',
  'diagnostics.memory.title': 'Java reported insufficient memory',
  'diagnostics.memory.help':
    'Check the exact memory error below. Review instance memory and available system RAM; heap exhaustion and native memory exhaustion need different adjustments.',
  'diagnostics.java-missing.title': 'Java executable was not found',
  'diagnostics.java-missing.help':
    'Choose an existing Java executable or enable automatic Java installation in settings, then retry.',
  'diagnostics.java-version.title': 'Java version requirement was not met',
  'diagnostics.java-version.help':
    'Use the Java version required by this game/loader. Compare the reported class version or Java requirement with your selected runtime.',
  'diagnostics.dependencies.title': 'The loader reported a dependency or loading conflict',
  'diagnostics.dependencies.help':
    'Read the named mods and version requirements in the evidence. Install the required compatible dependency or disable the conflicting mod before retrying.',
  'diagnostics.mixin.title': 'A Mixin transformation failed',
  'diagnostics.mixin.help': 'Check the cited Mixin and mod versions against the game and loader.',
  'diagnostics.native.title': 'Java reported a native crash',
  'diagnostics.native.help':
    'Review the fatal log and problematic frame, then check the named runtime, native library or graphics driver.',
  'diagnostics.invalidTarget': 'Choose an absolute destination ending in .zip.',
  'diagnostics.unsafePath': 'Skipped a link or path outside the instance: {{name}}',
  'diagnostics.notFile': 'The diagnostic source is not a regular file: {{name}}',
  'diagnostics.readFailed': 'Could not include {{name}}: {{error}}',
  'diagnostics.archiveReadme':
    'NixelLauncher local diagnostics\n\nreport.json contains redacted instance/content metadata, findings and source text. logs/1.txt, logs/2.txt, etc. correspond to the ordered sources in report.json. Evidence line numbers refer to the included text; truncated files contain their final excerpt only. Up to three recent crash reports and one JVM fatal log are included, and may belong to older launches.\n\nNo account store, original instance configuration, launch arguments, environment dump, saves or mod binaries are collected. Known account/service secrets, common credential fields and local identity/path patterns are redacted. Custom personal text written by mods may remain: inspect this archive before sharing. No files were uploaded.\n',
};

export const diagnosticsZh: Record<keyof typeof diagnosticsEn, string> = {
  'diagnostics.plugin': '崩溃诊断',
  'diagnostics.description': '检查本地错误证据并导出脱敏诊断包。',
  'diagnostics.title': '本地诊断报告',
  'diagnostics.analyze': '分析日志',
  'diagnostics.export': '导出诊断 ZIP',
  'diagnostics.collecting': '正在收集并脱敏本地诊断信息…',
  'diagnostics.packing': '正在写入诊断包…',
  'diagnostics.exported': '已保存脱敏诊断包。',
  'diagnostics.scope': '查看本地日志中的错误特征与证据。对照来源时间，区分不同次启动。',
  'diagnostics.privacy':
    '导出会在本机保存脱敏日志与实例信息。分享前请检查归档，其中可能仍有自定义的个人文本。',
  'diagnostics.empty': '所收集文本中未发现支持识别的错误特征。请检查下方日志和读取提示。',
  'diagnostics.noSources': '未找到可读取的启动日志或崩溃报告。',
  'diagnostics.sources': '已收集来源',
  'diagnostics.source': '{{name}} · {{date}}',
  'diagnostics.truncated': '仅包含末尾 1 MiB。证据行号对应所收集的片段。',
  'diagnostics.evidence': '{{source}} · 所收集文本第 {{line}} 行',
  'diagnostics.related': '证据中提及的文件：{{files}}',
  'diagnostics.memory.title': 'Java 报告内存不足',
  'diagnostics.memory.help':
    '检查下方具体内存错误，并查看实例内存设置和系统可用内存。堆内存耗尽与本机内存耗尽需要不同的调整方式。',
  'diagnostics.java-missing.title': '未找到 Java 可执行文件',
  'diagnostics.java-missing.help':
    '选择有效的 Java 可执行文件，或在设置中启用自动安装 Java，然后重试。',
  'diagnostics.java-version.title': '未满足 Java 版本要求',
  'diagnostics.java-version.help':
    '使用游戏和加载器要求的 Java 版本，对照日志中的类文件版本或 Java 要求检查当前运行时。',
  'diagnostics.dependencies.title': '加载器报告依赖或加载冲突',
  'diagnostics.dependencies.help':
    '阅读证据中具体的模组名称和版本要求，安装兼容的必需依赖，或停用冲突模组后重试。',
  'diagnostics.mixin.title': 'Mixin 转换失败',
  'diagnostics.mixin.help': '检查证据中提及的 Mixin、模组版本是否适用于当前游戏和加载器。',
  'diagnostics.native.title': 'Java 报告本机代码崩溃',
  'diagnostics.native.help': '查看致命错误日志与出错栈帧，检查其中提及的运行时、本机库或显卡驱动。',
  'diagnostics.invalidTarget': '请选择以 .zip 结尾的绝对目标路径。',
  'diagnostics.unsafePath': '已跳过链接或实例外路径：{{name}}',
  'diagnostics.notFile': '诊断来源不是普通文件：{{name}}',
  'diagnostics.readFailed': '无法收集 {{name}}：{{error}}',
  'diagnostics.archiveReadme':
    'NixelLauncher 本地诊断\n\nreport.json 包含脱敏后的实例和内容元信息、发现项及来源文本。logs/1.txt、logs/2.txt 等对应 report.json 中按顺序排列的来源。证据行号对应所收集的文本，截断文件仅包含末尾片段。最多收集三份近期崩溃报告和一份 JVM 致命错误日志，它们可能属于较早的启动。\n\n不收集账号存储、原始实例配置、启动参数、环境变量转储、存档或模组文件。已脱敏已知账号和服务密钥、常见凭据字段与本地身份和路径特征。模组写入的自定义个人文本可能仍然存在，分享前请检查此归档。未上传任何文件。\n',
};
