export const networkEn = {
  'network.name': 'Network',
  'network.description': 'Proxy routing for launcher services, downloads and images.',
  'network.title': 'Connection',
  'network.mode': 'Proxy',
  'network.system': 'Use system settings',
  'network.direct': 'Direct connection',
  'network.custom': 'Custom proxy',
  'network.url': 'Proxy address',
  'network.hint':
    'HTTP, HTTPS or SOCKS5 address without a username or password. Applies to launcher requests; game connections use their own settings.',
  'network.save': 'Apply connection settings',
  'network.saved': 'Connection settings applied.',
  'network.invalidMode': 'Choose a supported connection mode.',
  'network.invalidUrl':
    'Enter an HTTP, HTTPS or SOCKS5 proxy address with a host and optional port, without credentials, a path or query.',
  'network.unsupportedSystemProxy':
    'The selected system proxy type is not supported. Choose an HTTP, HTTPS or SOCKS5 proxy.',
  'network.stopped': 'The network plugin has stopped.',
  'network.check': 'Check connection',
  'network.checking': 'Checking launcher connections…',
  'network.contacting': 'Connecting to {{name}}…',
  'network.connected': '{{name}} connected.',
  'network.keywords':
    'download concurrency proxy network connection HTTP SOCKS5 Modrinth CurseForge',
} as const;

export const networkZh: Record<keyof typeof networkEn, string> = {
  'network.name': '网络连接',
  'network.description': '为启动器服务、下载与图片配置代理。',
  'network.title': '连接方式',
  'network.mode': '代理',
  'network.system': '跟随系统',
  'network.direct': '直接连接',
  'network.custom': '自定义代理',
  'network.url': '代理地址',
  'network.hint':
    '支持不含用户名与密码的 HTTP、HTTPS 或 SOCKS5 地址。应用于启动器请求；游戏连接使用自身设置。',
  'network.save': '应用连接设置',
  'network.saved': '连接设置已应用。',
  'network.invalidMode': '请选择支持的连接方式。',
  'network.invalidUrl':
    '请输入 HTTP、HTTPS 或 SOCKS5 代理地址，可包含端口，不包含凭据、路径或查询参数。',
  'network.unsupportedSystemProxy': '当前系统代理类型尚不支持，请选择 HTTP、HTTPS 或 SOCKS5 代理。',
  'network.stopped': '网络插件已停止。',
  'network.check': '检查连接',
  'network.checking': '正在检查启动器连接…',
  'network.contacting': '正在连接 {{name}}…',
  'network.connected': '{{name}} 连接成功。',
  'network.keywords': '下载 并发 代理 网络 连接 HTTP SOCKS5 Modrinth CurseForge',
};
