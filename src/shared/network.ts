export type ProxyMode = 'system' | 'direct' | 'custom';

export interface NetworkConfiguration {
  mode: ProxyMode;
  proxyUrl: string;
}

export const defaultNetworkConfiguration: NetworkConfiguration = {
  mode: 'system',
  proxyUrl: '',
};
