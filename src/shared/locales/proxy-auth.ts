export const proxyAuthEn = {
  'proxyAuth.enabled': 'Proxy authentication',
  'proxyAuth.invalidAuthentication': 'Choose whether to enable proxy authentication.',
  'proxyAuth.username': 'Proxy username',
  'proxyAuth.password': 'Proxy password',
  'proxyAuth.savedPassword': 'Password saved. Leave blank to keep it.',
  'proxyAuth.newPassword': 'Enter a new password',
  'proxyAuth.hint':
    'HTTP and HTTPS proxies support a username and password. SOCKS5 connections use no authentication.',
  'proxyAuth.passwordRequired':
    'Enter a password for this proxy address and username, or turn off proxy authentication.',
  'proxyAuth.invalidUsername': 'Enter a proxy username without a colon or control characters.',
  'proxyAuth.unsupported':
    'Proxy authentication is available only for custom HTTP or HTTPS proxies.',
  'proxyAuth.invalidCredential':
    'The saved proxy credential is unavailable or belongs to a different proxy. Enter the password again.',
  'proxyAuth.busy': 'Connection settings are already being saved.',
  'proxyAuth.restoreFailed':
    'Connection settings could not be restored. Check the network plugin before making requests.',
  'proxyAuth.cleanupFailed':
    'Connection settings were applied, but an unused saved proxy credential could not be removed.',
  'proxyAuth.configureFailed':
    'The authenticated proxy could not be configured. Check the proxy address and credentials.',
} as const;
export const proxyAuthZh = {
  'proxyAuth.enabled': '代理身份验证',
  'proxyAuth.invalidAuthentication': '请选择是否启用代理身份验证。',
  'proxyAuth.username': '代理用户名',
  'proxyAuth.password': '代理密码',
  'proxyAuth.savedPassword': '已保存密码，留空则保留。',
  'proxyAuth.newPassword': '输入新密码',
  'proxyAuth.hint': 'HTTP 与 HTTPS 代理支持用户名密码认证；SOCKS5 使用无认证连接。',
  'proxyAuth.passwordRequired': '请为此代理地址和用户名输入密码，或关闭代理身份验证。',
  'proxyAuth.invalidUsername': '请输入不含冒号或控制字符的代理用户名。',
  'proxyAuth.unsupported': '代理身份验证仅适用于自定义 HTTP 或 HTTPS 代理。',
  'proxyAuth.invalidCredential': '保存的代理凭据不可用，或属于其他代理，请重新输入密码。',
  'proxyAuth.busy': '正在保存连接设置。',
  'proxyAuth.restoreFailed': '无法恢复连接设置，请在发起请求前检查网络插件。',
  'proxyAuth.cleanupFailed': '连接设置已应用，但未使用的旧代理凭据未能删除。',
  'proxyAuth.configureFailed': '无法配置需要认证的代理，请检查代理地址与凭据。',
} satisfies Record<keyof typeof proxyAuthEn, string>;
