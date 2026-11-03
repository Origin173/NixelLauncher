import type { NixelBridge } from '../../shared/contracts';

declare global {
  interface Window {
    nixel: Readonly<NixelBridge>;
  }
}
