export type AppLocale = 'en' | 'tr';

export interface AppState {
  locale: AppLocale;
  systemLocale: string;
  firstRun: boolean;
  dataDirectory: string | null;
  hasDiscordToken: boolean;
}

export interface InitializeDataDirectoryRequest {
  path: string;
  useExisting: boolean;
}

export interface BotStatus {
  state: 'offline' | 'connecting' | 'online' | 'error';
  userTag: string | null;
  guildCount: number;
  ping: number | null;
  lastError: string | null;
}

export interface WhitelistEntry {
  userId: string;
  label: string | null;
  level: 'owner' | 'trusted';
}

export interface BlacklistEntry {
  userId: string;
  reason: string | null;
}

export interface AutoReplyEntry {
  id: number;
  guildId: string;
  trigger: string;
  response: string;
  enabled: boolean;
}

export interface GuildSummary {
  id: string;
  name: string;
  memberCount: number;
  iconUrl: string | null;
}

export interface BotLogEntry {
  time: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface MusicQueueEntry {
  title: string;
  url: string;
  requestedBy: string;
}

export interface IpProfile {
  address: string;
  port: string;
  version: string;
  color: string;
  enabled: boolean;
}

export interface AiConnectionTestResult {
  ok: boolean;
  message: string;
}

export interface AiModelListResult {
  ok: boolean;
  message: string;
  models: string[];
}

export interface AiModelCatalogEntry {
  name: string;
  capabilities: string[];
}

export interface AiModelCatalogResult {
  ok: boolean;
  message: string;
  models: AiModelCatalogEntry[];
}

export interface AppApi {
  getState(): Promise<AppState>;
  getDefaultDataDirectory(): Promise<string>;
  chooseDataDirectory(): Promise<string | null>;
  initializeDataDirectory(request: InitializeDataDirectoryRequest): Promise<AppState>;
  setLocale(locale: AppLocale): Promise<AppState>;
  setDiscordToken(token: string): Promise<AppState>;
  clearDiscordToken(): Promise<AppState>;
  getBotStatus(): Promise<BotStatus>;
  startBot(): Promise<BotStatus>;
  stopBot(): Promise<BotStatus>;
  getWhitelist(): Promise<WhitelistEntry[]>;
  saveWhitelist(entry: WhitelistEntry): Promise<WhitelistEntry[]>;
  removeWhitelist(userId: string): Promise<WhitelistEntry[]>;
  getBlacklist(): Promise<BlacklistEntry[]>;
  saveBlacklist(entry: BlacklistEntry): Promise<BlacklistEntry[]>;
  removeBlacklist(userId: string): Promise<BlacklistEntry[]>;
  getAutoReplies(): Promise<AutoReplyEntry[]>;
  addAutoReply(entry: Omit<AutoReplyEntry, 'id' | 'enabled'>): Promise<AutoReplyEntry[]>;
  removeAutoReply(id: number): Promise<AutoReplyEntry[]>;
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
  getGuildSetting(guildId: string, key: string): Promise<string | null>;
  setGuildSetting(guildId: string, key: string, value: string): Promise<void>;
  getGuilds(): Promise<GuildSummary[]>;
  getLogs(): Promise<BotLogEntry[]>;
  getMusicQueue(guildId: string): Promise<MusicQueueEntry[]>;
  getIpProfile(guildId: string): Promise<IpProfile | null>;
  setIpProfile(guildId: string, profile: IpProfile): Promise<void>;
  testOllamaConnection(url: string): Promise<AiConnectionTestResult>;
  testComfyConnection(url: string): Promise<AiConnectionTestResult>;
  getOllamaModels(url: string): Promise<AiModelListResult>;
  getOllamaModelCatalog(url: string): Promise<AiModelCatalogResult>;
  getComfyCheckpoints(url: string): Promise<AiModelListResult>;
}
