import type { BuiltinPlugin } from '../shared/host-api';
import {
  accountsPlugin,
  microsoftId,
  microsoftPlugin,
  offlineId,
  offlinePlugin,
  yggdrasilId,
  yggdrasilPlugin,
} from './accounts';
import { curseforgeId, curseforgePlugin } from './curseforge';
import { gameId, gamePlugin, instancesPlugin } from './game';
import { contentPlugin, resourcesId, resourcesPlugin } from './resources';

export const builtinPlugins: BuiltinPlugin[] = [
  {
    manifest: {
      id: curseforgeId,
      name: 'CurseForge',
      description: '通过自己的 API Key 搜索与安装 CurseForge 资源、依赖及标准整合包。',
      version: '0.1.0',
      apiVersion: 1,
      category: '资源服务',
    },
    plugin: curseforgePlugin,
  },
  {
    manifest: {
      id: 'nixel.instances',
      name: '实例管理',
      description: '独立实例、文件与整合包管理。',
      version: '0.1.0',
      apiVersion: 1,
      category: '核心',
    },
    plugin: instancesPlugin,
  },
  {
    manifest: {
      id: 'nixel.accounts',
      name: '账号管理',
      description: '管理与刷新各账号服务的游戏角色。',
      version: '0.1.0',
      apiVersion: 1,
      category: '核心',
    },
    plugin: accountsPlugin,
  },
  {
    manifest: {
      id: 'nixel.resources',
      name: '内容管理',
      description: '资源提供者分发与本地内容文件管理。',
      version: '0.1.0',
      apiVersion: 1,
      category: '核心',
    },
    plugin: contentPlugin,
  },
  {
    manifest: {
      id: gameId,
      name: 'Minecraft 游戏服务',
      description:
        '基于 XMCL 安装与启动 Vanilla、Fabric、Forge、NeoForge 和 Quilt，管理独立实例与整合包。',
      version: '0.1.0',
      apiVersion: 1,
      category: '游戏服务',
    },
    plugin: gamePlugin,
  },
  {
    manifest: {
      id: resourcesId,
      name: 'Modrinth 资源服务',
      description: '搜索兼容资源，解析必需依赖，校验下载并管理实例内容。',
      version: '0.1.0',
      apiVersion: 1,
      category: '资源服务',
    },
    plugin: resourcesPlugin,
  },
  {
    manifest: {
      id: offlineId,
      name: '离线角色',
      description: '使用标准 OfflinePlayer UUID 管理本地角色。',
      version: '0.1.0',
      apiVersion: 1,
      category: '账号服务',
    },
    plugin: offlinePlugin,
  },
  {
    manifest: {
      id: microsoftId,
      name: 'Microsoft 账号',
      description: '使用自己的公共客户端 ID，通过设备代码登录 Minecraft Java 账号。',
      version: '0.1.0',
      apiVersion: 1,
      category: '账号服务',
    },
    plugin: microsoftPlugin,
  },
  {
    manifest: {
      id: yggdrasilId,
      name: 'Yggdrasil 账号',
      description: '第三方认证服务与 authlib-injector 启动。',
      version: '0.1.0',
      apiVersion: 1,
      category: '账号服务',
    },
    plugin: yggdrasilPlugin,
  },
];
