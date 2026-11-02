export {};

declare global {
  interface Window {
    nixel: Readonly<{ platform: string }>;
  }
}
