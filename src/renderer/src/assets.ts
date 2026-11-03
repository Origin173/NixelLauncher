import pack from './assets/icons/DefaultPack.webp';
import fabric from './assets/icons/Fabric.png';
import forge from './assets/icons/Forge.png';
import grass from './assets/icons/GrassBlock.png';
import neoforge from './assets/icons/NeoForge.png';
import quilt from './assets/icons/Quilt.png';
import world from './assets/icons/UnknownWorld.webp';
import steve from './assets/skins/steve.png';

export const launcherIcon = new URL('./assets/nixel.svg', import.meta.url).href;
export const playerSkin = steve;
const images: Record<string, string> = {
  Vanilla: grass,
  Fabric: fabric,
  Forge: forge,
  NeoForge: neoforge,
  Quilt: quilt,
  modpacks: grass,
  resourcepacks: pack,
  shaders: world,
};
export const assetFor = (kind?: string) => (kind ? images[kind] : undefined);
