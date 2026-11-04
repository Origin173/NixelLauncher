import { Agent, type Dispatcher, ProxyAgent } from 'undici';
import { tr } from '../../shared/i18n';
import type { NetworkConfiguration } from '../../shared/network';
import type { ProxyCredential } from '../../shared/proxy-authentication';

/** Chromium resolves OS/PAC settings; Undici owns Host HTTP connections. */
export function networkDispatcher(
  config: NetworkConfiguration,
  resolveProxy: (url: string) => Promise<string>,
  credential?: ProxyCredential,
) {
  const direct = new Agent();
  const proxies = new Map<string, ProxyAgent>();
  let disposed = false;
  function proxy(uri: string) {
    let agent = proxies.get(uri);
    if (!agent) {
      agent = new ProxyAgent({
        uri,
        ...(credential && config.mode === 'custom' && uri === config.proxyUrl
          ? {
              token: `Basic ${Buffer.from(`${credential.username}:${credential.password}`).toString('base64')}`,
            }
          : {}),
      });
      proxies.set(uri, agent);
    }
    return agent;
  }
  function systemRoute(value: string): Dispatcher {
    // Respect the first route selected by the system, without replaying a request on failure.
    const first = value.split(';')[0]?.trim() || 'DIRECT';
    if (first === 'DIRECT') return direct;
    const [kind, address] = first.split(/\s+/);
    const protocol = { PROXY: 'http', HTTPS: 'https', SOCKS5: 'socks5' }[kind ?? ''];
    if (!protocol || !address) throw new Error(tr('network.unsupportedSystemProxy'));
    return proxy(`${protocol}://${address}`);
  }
  const dispatcher = direct.compose(() => (options, handler) => {
    if (disposed) throw new Error(tr('network.stopped'));
    if (config.mode === 'direct') return direct.dispatch(options, handler);
    if (config.mode === 'custom') return proxy(config.proxyUrl).dispatch(options, handler);
    const url = new URL(options.path, options.origin).href;
    void resolveProxy(url)
      .then((route) => {
        if (disposed) throw new Error(tr('network.stopped'));
        systemRoute(route).dispatch(options, handler);
      })
      .catch((error: Error) => {
        // Like Undici's DNS interceptor, routing can fail before a request controller exists.
        handler.onResponseError?.(null as unknown as Dispatcher.DispatchController, error);
      });
    return true;
  });
  return {
    dispatcher,
    async dispose() {
      disposed = true;
      credential = undefined;
      await Promise.all([direct, ...proxies.values()].map((agent) => agent.destroy()));
      proxies.clear();
    },
  };
}
