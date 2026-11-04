import { randomUUID } from 'node:crypto';
import type { NixelHost } from '../../shared/host-api';
import { tr } from '../../shared/i18n';
import type { NetworkConfiguration, NetworkConfigurationInput } from '../../shared/network';
import { proxyCredentialKey, readProxyCredential } from '../../shared/proxy-authentication';
import { networkConfiguration, proxyUsername } from './configuration';

// Configuration replaces this plugin's scope. Keep the save guard across that replacement.
let saving = false;

export async function configureNetwork(
  host: NixelHost,
  previous: NetworkConfiguration,
  input: NetworkConfigurationInput,
) {
  if (saving) throw new Error(tr('proxyAuth.busy'));
  saving = true;
  let created: string | undefined;
  try {
    const next = networkConfiguration({ mode: input.mode, proxyUrl: input.proxyUrl });
    const authentication = input.authentication ?? Boolean(previous.credentialId);
    if (typeof authentication !== 'boolean') throw new Error(tr('proxyAuth.invalidAuthentication'));
    if (authentication && next.mode === 'custom') {
      if (!next.proxyUrl.startsWith('http:') && !next.proxyUrl.startsWith('https:'))
        throw new Error(tr('proxyAuth.unsupported'));
      next.username = proxyUsername(input.username);
      if (input.password !== undefined && typeof input.password !== 'string')
        throw new Error(tr('proxyAuth.passwordRequired'));
      if (input.password) {
        created = randomUUID();
        await host.platform.secretSet(
          proxyCredentialKey(created),
          JSON.stringify({
            proxyUrl: next.proxyUrl,
            username: next.username,
            password: input.password,
          }),
        );
        next.credentialId = created;
      } else {
        if (
          !previous.credentialId ||
          previous.proxyUrl !== next.proxyUrl ||
          previous.username !== next.username
        )
          throw new Error(tr('proxyAuth.passwordRequired'));
        next.credentialId = previous.credentialId;
        readProxyCredential(
          await host.platform.secretGet(proxyCredentialKey(next.credentialId)),
          next,
        );
      }
    }
    await host.commands.invoke('plugins.configure', { id: 'nixel.network', config: next });
    if (previous.credentialId && previous.credentialId !== next.credentialId) {
      try {
        await host.platform.secretDelete(proxyCredentialKey(previous.credentialId));
      } catch {
        console.warn(tr('proxyAuth.cleanupFailed'));
      }
    }
  } catch (error) {
    const liveReference = host.snapshot().plugins.find((entry) => entry.id === 'nixel.network')
      ?.config.credentialId;
    const savedReference = host.store.read().plugins['nixel.network']?.config.credentialId;
    // Host owns activation/persistence rollback. Keep any secret still referenced after its failure.
    if (created && created !== liveReference && created !== savedReference) {
      try {
        await host.platform.secretDelete(proxyCredentialKey(created));
      } catch {
        console.warn(tr('proxyAuth.cleanupFailed'));
      }
    }
    throw error;
  } finally {
    saving = false;
  }
}
