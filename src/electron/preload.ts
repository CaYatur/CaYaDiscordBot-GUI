import { contextBridge, ipcRenderer } from 'electron';
import type { AppApi, AppLocale, InitializeDataDirectoryRequest } from '../shared/contracts.js';

const api: AppApi = {
  getState: () => ipcRenderer.invoke('app:get-state'),
  getDefaultDataDirectory: () => ipcRenderer.invoke('app:get-default-data-directory'),
  chooseDataDirectory: () => ipcRenderer.invoke('app:choose-data-directory'),
  initializeDataDirectory: (request: InitializeDataDirectoryRequest) =>
    ipcRenderer.invoke('app:initialize-data-directory', request),
  setLocale: (locale: AppLocale) => ipcRenderer.invoke('settings:set-locale', locale),
  setDiscordToken: (token: string) => ipcRenderer.invoke('secrets:set-discord-token', token),
  clearDiscordToken: () => ipcRenderer.invoke('secrets:clear-discord-token'),
  getBotStatus: () => ipcRenderer.invoke('bot:get-status'),
  startBot: () => ipcRenderer.invoke('bot:start'),
  stopBot: () => ipcRenderer.invoke('bot:stop'),
  getWhitelist: () => ipcRenderer.invoke('access:get-whitelist'),
  saveWhitelist: entry => ipcRenderer.invoke('access:save-whitelist', entry),
  removeWhitelist: userId => ipcRenderer.invoke('access:remove-whitelist', userId),
  getBlacklist: () => ipcRenderer.invoke('access:get-blacklist'),
  saveBlacklist: entry => ipcRenderer.invoke('access:save-blacklist', entry),
  removeBlacklist: userId => ipcRenderer.invoke('access:remove-blacklist', userId),
  getAutoReplies: () => ipcRenderer.invoke('auto-replies:get'),
  addAutoReply: entry => ipcRenderer.invoke('auto-replies:add', entry),
  removeAutoReply: id => ipcRenderer.invoke('auto-replies:remove', id),
  getSetting: key => ipcRenderer.invoke('settings:get', key),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  getGuildSetting: (guildId, key) => ipcRenderer.invoke('guild-settings:get', guildId, key),
  setGuildSetting: (guildId, key, value) => ipcRenderer.invoke('guild-settings:set', guildId, key, value),
  getGuilds: () => ipcRenderer.invoke('bot:get-guilds'),
  getLogs: () => ipcRenderer.invoke('bot:get-logs'),
  getMusicQueue: guildId => ipcRenderer.invoke('bot:get-music-queue', guildId),
  getIpProfile: guildId => ipcRenderer.invoke('guild-ip:get', guildId),
  setIpProfile: (guildId, profile) => ipcRenderer.invoke('guild-ip:set', guildId, profile),
  testOllamaConnection: url => ipcRenderer.invoke('ai:test-ollama', url),
  testComfyConnection: url => ipcRenderer.invoke('ai:test-comfy', url),
  getOllamaModels: url => ipcRenderer.invoke('ai:get-ollama-models', url),
  getOllamaModelCatalog: url => ipcRenderer.invoke('ai:get-ollama-model-catalog', url),
  getComfyCheckpoints: url => ipcRenderer.invoke('ai:get-comfy-checkpoints', url)
};

contextBridge.exposeInMainWorld('caya', api);
