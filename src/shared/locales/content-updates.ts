export const contentUpdatesEn = {
  'contentUpdates.planningUnsupported':
    '{{source}} does not support this update operation. Choose a resource plugin that supports content updates.',
  'contentUpdates.invalidPlan':
    'The resource provider returned an incomplete or inconsistent update plan.',
  'contentUpdates.pathConflict': 'The update plan conflicts with another file: {{path}}.',
};
export const contentUpdatesZh: Record<keyof typeof contentUpdatesEn, string> = {
  'contentUpdates.planningUnsupported':
    '{{source}} 暂不支持此更新操作。请使用支持内容更新的资源插件。',
  'contentUpdates.invalidPlan': '资源提供者返回了不完整或不一致的更新计划。',
  'contentUpdates.pathConflict': '更新计划与其他文件冲突：{{path}}。',
};
