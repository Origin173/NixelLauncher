import type { Instance, LauncherSettings } from './contracts';

/** An explicit choice wins; the home-page choice only applies to its selected instance. */
export function launchAccountId(
  instance: Pick<Instance, 'id' | 'account'>,
  settings: Pick<LauncherSettings, 'launchInstance' | 'launchAccount' | 'defaultAccount'>,
  override?: string,
) {
  return (
    override ||
    (settings.launchInstance === instance.id ? settings.launchAccount : '') ||
    instance.account ||
    settings.defaultAccount
  );
}
