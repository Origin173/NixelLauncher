export type SkinModel = 'classic' | 'slim';
export type AppearanceChange =
  | { kind: 'upload'; path: string; model: SkinModel; sha256: string }
  | { kind: 'reset' }
  | { kind: 'cape'; capeId: string | null };
export interface AccountAppearance {
  skin: { url: string; model: SkinModel; isDefault: boolean } | null;
  capes: { id: string; name: string; url: string; active: boolean }[];
}
export interface SkinFile {
  path: string;
  dataUrl: string;
  sha256: string;
  height: number;
}
