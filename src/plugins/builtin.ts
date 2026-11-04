import type { BuiltinPlugin } from '../shared/host-api';
import { tr, withTranslations } from '../shared/i18n';
import {
  accountsPlugin,
  microsoftId,
  microsoftPlugin,
  offlineId,
  offlinePlugin,
  yggdrasilId,
  yggdrasilPlugin,
} from './accounts';
import { contentPlugin } from './content';
import { curseforgeId, curseforgePlugin } from './curseforge';
import { diagnosticsPlugin } from './diagnostics';
import { downloadsPlugin } from './downloads';
import { instancesPlugin } from './instances';
import { gameId, gamePlugin } from './minecraft';
import { resourcesId, resourcesPlugin } from './modrinth';
import { networkId, networkPlugin } from './network';
import { serversPlugin } from './servers';
import { skinsPlugin } from './skins';

export const builtinPlugins: BuiltinPlugin[] = [
  {
    manifest: withTranslations(
      {
        id: 'nixel.downloads',
        dependencies: [networkId],
        name: tr('downloads.plugin'),
        description: tr('downloads.description'),
        version: '0.1.0',
        apiVersion: 1,
        category: tr('builtin.core'),
      },
      { name: 'downloads.plugin', description: 'downloads.description', category: 'builtin.core' },
    ),
    plugin: downloadsPlugin,
  },
  {
    manifest: withTranslations(
      {
        id: 'nixel.skins',
        name: tr('skins.plugin'),
        description: tr('skins.description'),
        version: '0.1.0',
        apiVersion: 1,
        category: tr('builtin.core'),
      },
      { name: 'skins.plugin', description: 'skins.description', category: 'builtin.core' },
    ),
    plugin: skinsPlugin,
  },
  {
    manifest: withTranslations(
      {
        id: networkId,
        name: tr('network.name'),
        description: tr('network.description'),
        version: '0.1.0',
        apiVersion: 1,
        category: tr('builtin.core'),
      },
      { name: 'network.name', description: 'network.description', category: 'builtin.core' },
    ),
    plugin: networkPlugin,
  },
  {
    manifest: withTranslations(
      {
        id: 'nixel.diagnostics',
        name: tr('diagnostics.plugin'),
        description: tr('diagnostics.description'),
        version: '0.1.0',
        apiVersion: 1,
        category: tr('builtin.core'),
        dependencies: ['nixel.instances'],
      },
      {
        name: 'diagnostics.plugin',
        description: 'diagnostics.description',
        category: 'builtin.core',
      },
    ),
    plugin: diagnosticsPlugin,
  },
  {
    manifest: withTranslations(
      {
        id: 'nixel.servers',
        name: tr('servers.pluginName'),
        description: tr('servers.pluginDescription'),
        version: '0.1.0',
        apiVersion: 1,
        category: tr('builtin.core'),
      },
      {
        name: 'servers.pluginName',
        description: 'servers.pluginDescription',
        category: 'builtin.core',
      },
    ),
    plugin: serversPlugin,
  },
  {
    manifest: withTranslations(
      {
        id: curseforgeId,
        dependencies: [networkId, 'nixel.downloads'],
        name: 'CurseForge',
        description: tr('builtin.searchAndInstallCurseforgeResourcesDependenciesAnd'),
        version: '0.1.0',
        apiVersion: 1,
        category: tr('builtin.resourceService'),
      },
      {
        description: 'builtin.searchAndInstallCurseforgeResourcesDependenciesAnd',
        category: 'builtin.resourceService',
      },
    ),
    plugin: curseforgePlugin,
  },
  {
    manifest: withTranslations(
      {
        id: 'nixel.instances',
        dependencies: ['nixel.downloads'],
        name: tr('builtin.instanceManager'),
        description: tr('builtin.manageIndependentInstancesFilesAndModpacks'),
        version: '0.1.0',
        apiVersion: 1,
        category: tr('builtin.core'),
      },
      {
        name: 'builtin.instanceManager',
        description: 'builtin.manageIndependentInstancesFilesAndModpacks',
        category: 'builtin.core',
      },
    ),
    plugin: instancesPlugin,
  },
  {
    manifest: withTranslations(
      {
        id: 'nixel.accounts',
        name: tr('builtin.accountManager'),
        description: tr('builtin.manageAndRefreshProfilesFromAccountProviders'),
        version: '0.1.0',
        apiVersion: 1,
        category: tr('builtin.core'),
      },
      {
        name: 'builtin.accountManager',
        description: 'builtin.manageAndRefreshProfilesFromAccountProviders',
        category: 'builtin.core',
      },
    ),
    plugin: accountsPlugin,
  },
  {
    manifest: withTranslations(
      {
        id: 'nixel.resources',
        name: tr('builtin.contentManager'),
        description: tr('builtin.routeResourceRequestsToProvidersAndManage'),
        version: '0.1.0',
        apiVersion: 1,
        category: tr('builtin.core'),
      },
      {
        name: 'builtin.contentManager',
        description: 'builtin.routeResourceRequestsToProvidersAndManage',
        category: 'builtin.core',
      },
    ),
    plugin: contentPlugin,
  },
  {
    manifest: withTranslations(
      {
        id: gameId,
        dependencies: [networkId, 'nixel.downloads'],
        name: tr('builtin.minecraftGameService'),
        description: tr('builtin.installAndLaunchVanillaFabricForgeNeoforge'),
        version: '0.1.0',
        apiVersion: 1,
        category: tr('builtin.gameService'),
      },
      {
        name: 'builtin.minecraftGameService',
        description: 'builtin.installAndLaunchVanillaFabricForgeNeoforge',
        category: 'builtin.gameService',
      },
    ),
    plugin: gamePlugin,
  },
  {
    manifest: withTranslations(
      {
        id: resourcesId,
        dependencies: [networkId, 'nixel.downloads'],
        name: tr('builtin.modrinthResources'),
        description: tr('builtin.findCompatibleContentResolveRequiredDependenciesAnd'),
        version: '0.1.0',
        apiVersion: 1,
        category: tr('builtin.resourceService'),
      },
      {
        name: 'builtin.modrinthResources',
        description: 'builtin.findCompatibleContentResolveRequiredDependenciesAnd',
        category: 'builtin.resourceService',
      },
    ),
    plugin: resourcesPlugin,
  },
  {
    manifest: withTranslations(
      {
        id: offlineId,
        name: tr('accounts.offlineProfile'),
        description: tr('builtin.manageLocalProfilesWithStandardOfflineplayerUuids'),
        version: '0.1.0',
        apiVersion: 1,
        category: tr('builtin.accountService'),
      },
      {
        name: 'accounts.offlineProfile',
        description: 'builtin.manageLocalProfilesWithStandardOfflineplayerUuids',
        category: 'builtin.accountService',
      },
    ),
    plugin: offlinePlugin,
  },
  {
    manifest: withTranslations(
      {
        id: microsoftId,
        dependencies: [networkId],
        name: tr('builtin.microsoftAccounts'),
        description: tr('builtin.signInToMinecraftJavaUsingDevice'),
        version: '0.1.0',
        apiVersion: 1,
        category: tr('builtin.accountService'),
      },
      {
        name: 'builtin.microsoftAccounts',
        description: 'builtin.signInToMinecraftJavaUsingDevice',
        category: 'builtin.accountService',
      },
    ),
    plugin: microsoftPlugin,
  },
  {
    manifest: withTranslations(
      {
        id: yggdrasilId,
        dependencies: [networkId, 'nixel.downloads'],
        name: tr('builtin.yggdrasilAccounts'),
        description: tr('builtin.thirdPartyAuthenticationAndAuthlibInjectorSupport'),
        version: '0.1.0',
        apiVersion: 1,
        category: tr('builtin.accountService'),
      },
      {
        name: 'builtin.yggdrasilAccounts',
        description: 'builtin.thirdPartyAuthenticationAndAuthlibInjectorSupport',
        category: 'builtin.accountService',
      },
    ),
    plugin: yggdrasilPlugin,
  },
];
