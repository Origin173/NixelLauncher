export const accountProfilesEn = {
  'accountProfiles.signIn': 'Sign in again',
  'accountProfiles.inUse': 'Stop the game using this account before switching its profile.',
  'accountProfiles.select': 'Select a game profile',
  'accountProfiles.confirm': 'Use this profile',
  'accountProfiles.switch': 'Switch profile',
  'accountProfiles.reauthenticate':
    'Sign in again to choose a profile. Your saved account and its default selections will be kept. The server may select a profile automatically when you sign in with its name.',
  'accountProfiles.expired': 'Profile selection has expired. Sign in again.',
  'accountProfiles.invalidProfile': 'Choose a profile returned by this authentication server.',
  'accountProfiles.invalidResponse':
    'The authentication server returned invalid account information.',
  'accountProfiles.requestFailed':
    'Authentication request failed (HTTP {{status}}). Check your credentials or sign in again.',
  'accountProfiles.profileChanged':
    'The server returned a different game profile. Sign in again to select it explicitly.',
  'accountProfiles.serverChanged': 'Use the original authentication server for this saved account.',
  'accountProfiles.alreadyAdded':
    'This profile is already saved. Select its existing account, or remove it before switching this account to it.',
} as const;
export const accountProfilesZh = {
  'accountProfiles.signIn': '重新登录',
  'accountProfiles.inUse': '请先停止使用此账号的游戏，再切换角色。',
  'accountProfiles.select': '选择游戏角色',
  'accountProfiles.confirm': '使用此角色',
  'accountProfiles.switch': '切换角色',
  'accountProfiles.reauthenticate':
    '重新登录后选择角色，将保留此账号记录及默认账号设置。使用角色名登录时，服务器可能自动选择该角色。',
  'accountProfiles.expired': '角色选择已过期，请重新登录。',
  'accountProfiles.invalidProfile': '请选择此认证服务器返回的角色。',
  'accountProfiles.invalidResponse': '认证服务器返回的账号信息无效。',
  'accountProfiles.requestFailed': '认证请求失败（HTTP {{status}}），请检查凭据或重新登录。',
  'accountProfiles.profileChanged': '服务器返回了不同的游戏角色，请重新登录并明确选择。',
  'accountProfiles.serverChanged': '请使用此账号原先的认证服务器。',
  'accountProfiles.alreadyAdded': '此角色已保存，请选择已有账号，或先移除该账号再切换。',
} satisfies Record<keyof typeof accountProfilesEn, string>;
