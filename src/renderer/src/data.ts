export type { Page, Resource } from '../../shared/contracts';

export function resourceSource(source?: string) {
  return !source || source === 'Modrinth' ? 'nixel.resources.modrinth' : source;
}
