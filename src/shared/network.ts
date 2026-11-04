export type ProxyMode = 'system' | 'direct' | 'custom';

export interface NetworkConfiguration {
  mode: ProxyMode;
  proxyUrl: string;
  username?: string;
  credentialId?: string;
}

export interface NetworkConfigurationInput {
  mode: ProxyMode;
  proxyUrl: string;
  authentication: boolean;
  username: string;
  /** Write-only. Omitted or empty keeps the existing, identically bound credential. */
  password?: string;
}

export const defaultNetworkConfiguration: NetworkConfiguration = {
  mode: 'system',
  proxyUrl: '',
};
