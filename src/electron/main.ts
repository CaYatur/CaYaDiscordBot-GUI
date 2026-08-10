import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import type { AppLocale, AppState, InitializeDataDirectoryRequest } from '../shared/contracts.js';
import { BotManager } from './services/bot-manager.next.js';
import { DataStore } from './services/data-store.js';
import { SecretService } from './services/secret-service.js';

const store = new DataStore();
const secrets = new SecretService(store);
const bot = new BotManager(store);

function detectSystemLocale(): AppLocale {
  return app.getLocale().toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

function getState(): AppState {
  const dataDirectory = store.getDataDirectory();
  const locale = store.getLocale() ?? detectSystemLocale();

  return {
    locale,
    systemLocale: app.getLocale(),
    firstRun: !dataDirectory,
    dataDirectory,
    hasDiscordToken: dataDirectory ? secrets.hasDiscordToken() : false
  };
}

function registerIpc(): void {
  ipcMain.handle('app:get-state', () => getState());
  ipcMain.handle('app:get-default-data-directory', () => store.getDefaultDataDirectory());

  ipcMain.handle('app:choose-data-directory', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select CaYa Bot data folder',
      properties: ['openDirectory', 'createDirectory']
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle('app:initialize-data-directory', (_event, request: InitializeDataDirectoryRequest) => {
    if (!request?.path) throw new Error('A data directory is required.');
    store.initialize(request.path, request.useExisting);
    return getState();
  });

  ipcMain.handle('settings:set-locale', (_event, locale: AppLocale) => {
    if (locale !== 'en' && locale !== 'tr') throw new Error('Unsupported language.');
    store.setLocale(locale);
    return getState();
  });

  ipcMain.handle('secrets:set-discord-token', (_event, token: string) => {
    secrets.setDiscordToken(token);
    return getState();
  });

  ipcMain.handle('secrets:clear-discord-token', () => {
    secrets.clearDiscordToken();
    return getState();
  });

  ipcMain.handle('access:get-whitelist', () => store.getWhitelist());
  ipcMain.handle('access:save-whitelist', (_event, entry: { userId: string; label: string | null; level: 'owner' | 'trusted' }) => {
    if (!/^\d{15,22}$/.test(entry.userId)) throw new Error('Invalid Discord user ID.');
    store.upsertWhitelist(entry.userId, entry.level, entry.label ?? undefined);
    return store.getWhitelist();
  });
  ipcMain.handle('access:remove-whitelist', (_event, userId: string) => {
    store.removeWhitelist(userId);
    return store.getWhitelist();
  });

  ipcMain.handle('access:get-blacklist', () => store.getBlacklist());
  ipcMain.handle('access:save-blacklist', (_event, entry: { userId: string; reason: string | null }) => {
    if (!/^\d{15,22}$/.test(entry.userId)) throw new Error('Invalid Discord user ID.');
    store.addBlacklist(entry.userId, entry.reason ?? undefined);
    return store.getBlacklist();
  });
  ipcMain.handle('access:remove-blacklist', (_event, userId: string) => {
    store.removeBlacklist(userId);
    return store.getBlacklist();
  });

  ipcMain.handle('auto-replies:get', () => store.getAutoReplies());
  ipcMain.handle('auto-replies:add', (_event, entry: { guildId: string; trigger: string; response: string }) => {
    if (!/^\d{15,22}$/.test(entry.guildId)) throw new Error('Invalid Discord guild ID.');
    if (!entry.trigger.trim() || !entry.response.trim()) throw new Error('Trigger and response are required.');
    store.addAutoReply(entry.guildId, entry.trigger, entry.response);
    return store.getAutoReplies();
  });
  ipcMain.handle('auto-replies:remove', (_event, id: number) => {
    store.deleteAutoReply(id);
    return store.getAutoReplies();
  });

  ipcMain.handle('settings:get', (_event, key: string) => store.getSetting(key));
  ipcMain.handle('settings:set', (_event, key: string, value: string) => {
    store.setSetting(key, value);
  });
  ipcMain.handle('guild-settings:get', (_event, guildId: string, key: string) => store.getGuildSetting(guildId, key));
  ipcMain.handle('guild-settings:set', async (_event, guildId: string, key: string, value: string) => {
    if (key === 'music_bitrate') {
      await bot.setMusicBitrate(guildId, Number(value));
      return;
    }
    store.setGuildSetting(guildId, key, value);
  });

  ipcMain.handle('bot:get-status', () => bot.getStatus());
  ipcMain.handle('bot:get-guilds', () => bot.getGuilds());
  ipcMain.handle('bot:get-logs', () => bot.getLogs());
  ipcMain.handle('bot:get-music-queue', (_event, guildId: string) => bot.getMusicQueue(guildId));
  ipcMain.handle('ai:test-ollama', (_event, url: string) => bot.testOllamaConnection(url));
  ipcMain.handle('ai:test-comfy', (_event, url: string) => bot.testComfyConnection(url));
  ipcMain.handle('ai:get-ollama-models', (_event, url: string) => bot.getOllamaModels(url));
  ipcMain.handle('ai:get-ollama-model-catalog', (_event, url: string) => bot.getOllamaModelCatalog(url));
  ipcMain.handle('ai:get-comfy-checkpoints', (_event, url: string) => bot.getComfyCheckpoints(url));
  ipcMain.handle('guild-ip:get', (_event, guildId: string) => store.getIpProfile(guildId));
  ipcMain.handle('guild-ip:set', (_event, guildId: string, profile: { address: string; port: string; version: string; color: string; enabled: boolean }) => {
    if (!/^#[0-9a-f]{6}$/i.test(profile.color)) throw new Error('Invalid IP profile color.');
    store.setIpProfile(guildId, profile);
  });

  ipcMain.handle('bot:start', async () => {
    const token = secrets.getDiscordToken();
    if (!token) throw new Error('Discord token is not configured.');
    return bot.start(token);
  });

  ipcMain.handle('bot:stop', () => bot.stop());
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#0b0d12',
    title: 'CaYa Bot',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:5173';
  if (!app.isPackaged) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  store.openConfiguredDatabase();
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  void bot.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
