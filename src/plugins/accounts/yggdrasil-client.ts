import type { AccountProfile } from '../../shared/contracts';
import { tr } from '../../shared/i18n';

export interface YggdrasilTokens {
  accessToken: string;
  clientToken: string;
}
export interface YggdrasilResponse extends YggdrasilTokens {
  selectedProfile?: AccountProfile;
  availableProfiles?: AccountProfile[];
}
export class YggdrasilClient {
  constructor(private readonly server: string) {}
  private async post(path: string, body: unknown, signal?: AbortSignal) {
    const response = await fetch(`${this.server}/authserver/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok)
      throw new Error(tr('accountProfiles.requestFailed', { status: response.status }));
    return response;
  }
  private async tokens(
    path: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<YggdrasilResponse> {
    const data = (await (await this.post(path, body, signal)).json()) as YggdrasilResponse;
    const validProfile = (profile: AccountProfile) =>
      profile &&
      typeof profile.id === 'string' &&
      /^[a-f0-9]{32}$/i.test(profile.id) &&
      typeof profile.name === 'string' &&
      profile.name.length > 0;
    if (
      !data ||
      typeof data.accessToken !== 'string' ||
      !data.accessToken ||
      typeof data.clientToken !== 'string' ||
      !data.clientToken ||
      (data.selectedProfile != null && !validProfile(data.selectedProfile)) ||
      (data.availableProfiles !== undefined &&
        (!Array.isArray(data.availableProfiles) || !data.availableProfiles.every(validProfile)))
    ) {
      throw new Error(tr('accountProfiles.invalidResponse'));
    }
    return {
      accessToken: data.accessToken,
      clientToken: data.clientToken,
      selectedProfile: data.selectedProfile
        ? { id: data.selectedProfile.id, name: data.selectedProfile.name }
        : undefined,
      availableProfiles: data.availableProfiles?.map(({ id, name }) => ({ id, name })),
    };
  }
  login(input: { username: string; password: string; clientToken: string }) {
    return this.tokens('authenticate', {
      ...input,
      agent: { name: 'Minecraft', version: 1 },
      requestUser: true,
    });
  }
  refresh(input: YggdrasilTokens, signal?: AbortSignal, selectedProfile?: AccountProfile) {
    return this.tokens('refresh', { ...input, selectedProfile, requestUser: true }, signal);
  }
  async validate(input: YggdrasilTokens, signal?: AbortSignal) {
    const response = await fetch(`${this.server}/authserver/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal,
    });
    if (response.status === 403) return false;
    if (!response.ok)
      throw new Error(tr('accountProfiles.requestFailed', { status: response.status }));
    return true;
  }
}
