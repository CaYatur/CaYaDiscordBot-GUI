import { app } from 'electron';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AppLocale } from '../../shared/contracts.js';
import { GLOBAL_SETTING_DEFAULTS, GUILD_SETTING_DEFAULTS } from '../../shared/default-settings.js';
import { AI_PROMPT_DEFAULTS, AI_PROMPT_LEGACY_DEFAULTS, AI_PROMPT_SETTING_KEYS, type AiPromptKey } from '../../shared/ai-prompts.js';

interface BootstrapConfig {
  dataDirectory?: string;
}

export class DataStore {
  private database: DatabaseSync | null = null;
  private dataDirectory: string | null = null;

  private get bootstrapPath(): string {
    return path.join(app.getPath('userData'), 'bootstrap.json');
  }

  getDefaultDataDirectory(): string {
    return path.join(app.getPath('userData'), 'data');
  }

  getDataDirectory(): string | null {
    if (this.dataDirectory) return this.dataDirectory;

    const configured = this.readBootstrap().dataDirectory;
    if (configured) this.dataDirectory = configured;
    return this.dataDirectory;
  }

  initialize(dataDirectory: string, useExisting = false): void {
    const resolved = path.resolve(dataDirectory);
    const databasePath = path.join(resolved, 'caya.db');

    if (useExisting && !existsSync(databasePath)) {
      throw new Error('The selected folder does not contain an existing caya.db database.');
    }

    mkdirSync(resolved, { recursive: true });
    mkdirSync(path.dirname(this.bootstrapPath), { recursive: true });

    this.writeBootstrap({ dataDirectory: resolved });
    this.openDatabase(resolved);
  }

  openConfiguredDatabase(): boolean {
    const configured = this.getDataDirectory();
    if (!configured) return false;

    mkdirSync(configured, { recursive: true });
    this.openDatabase(configured);
    return true;
  }

  getSetting(key: string): string | null {
    if (!this.database) return null;
    const row = this.database.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value?: string } | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    this.requireDatabase().prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(key, value);
  }

  getLocale(): AppLocale | null {
    const value = this.getSetting('locale');
    return value === 'tr' || value === 'en' ? value : null;
  }

  setLocale(locale: AppLocale): void {
    this.setSetting('locale', locale);
  }

  getSecret(name: string): string | null {
    if (!this.database) return null;
    const row = this.database.prepare('SELECT encrypted_value FROM secrets WHERE name = ?').get(name) as { encrypted_value?: string } | undefined;
    return row?.encrypted_value ?? null;
  }

  setSecret(name: string, encryptedValue: string): void {
    this.requireDatabase().prepare(`
      INSERT INTO secrets (name, encrypted_value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(name) DO UPDATE SET encrypted_value = excluded.encrypted_value, updated_at = CURRENT_TIMESTAMP
    `).run(name, encryptedValue);
  }

  deleteSecret(name: string): void {
    if (!this.database) return;
    this.database.prepare('DELETE FROM secrets WHERE name = ?').run(name);
  }

  getGuildSetting(guildId: string, key: string): string | null {
    if (!this.database) return null;
    const row = this.database.prepare('SELECT value FROM guild_settings WHERE guild_id = ? AND key = ?').get(guildId, key) as { value?: string } | undefined;
    if (row?.value !== undefined) return row.value;

    const defaultValue = GUILD_SETTING_DEFAULTS[key];
    if (defaultValue === undefined) return null;

    this.database.prepare(`
      INSERT OR IGNORE INTO guild_settings (guild_id, key, value, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(guildId, key, defaultValue);
    return defaultValue;
  }

  setGuildSetting(guildId: string, key: string, value: string): void {
    this.requireDatabase().prepare(`
      INSERT INTO guild_settings (guild_id, key, value, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(guild_id, key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(guildId, key, value);
  }

  getAutoReplies(guildId?: string): Array<{ id: number; guildId: string; trigger: string; response: string; enabled: boolean }> {
    if (!this.database) return [];
    const rows = guildId
      ? this.database.prepare('SELECT id, guild_id, trigger, response, enabled FROM auto_replies WHERE guild_id = ? ORDER BY id').all(guildId)
      : this.database.prepare('SELECT id, guild_id, trigger, response, enabled FROM auto_replies ORDER BY guild_id, id').all();
    return (rows as Array<{ id: number; guild_id: string; trigger: string; response: string; enabled: number }>).map(row => ({
      id: row.id,
      guildId: row.guild_id,
      trigger: row.trigger,
      response: row.response,
      enabled: row.enabled === 1
    }));
  }

  addAutoReply(guildId: string, trigger: string, response: string): number {
    const result = this.requireDatabase().prepare('INSERT INTO auto_replies (guild_id, trigger, response) VALUES (?, ?, ?)').run(guildId, trigger.trim(), response.trim());
    return Number(result.lastInsertRowid);
  }

  deleteAutoReply(id: number): void {
    this.requireDatabase().prepare('DELETE FROM auto_replies WHERE id = ?').run(id);
  }

  getBlacklist(): Array<{ userId: string; reason: string | null }> {
    if (!this.database) return [];
    const rows = this.database.prepare('SELECT user_id, reason FROM blacklist ORDER BY created_at DESC').all() as Array<{ user_id: string; reason: string | null }>;
    return rows.map(row => ({ userId: row.user_id, reason: row.reason }));
  }

  isBlacklisted(userId: string): boolean {
    if (!this.database) return false;
    return Boolean(this.database.prepare('SELECT 1 FROM blacklist WHERE user_id = ?').get(userId));
  }

  addBlacklist(userId: string, reason?: string): void {
    this.requireDatabase().prepare('INSERT OR REPLACE INTO blacklist (user_id, reason, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)').run(userId, reason ?? null);
  }

  removeBlacklist(userId: string): void {
    this.requireDatabase().prepare('DELETE FROM blacklist WHERE user_id = ?').run(userId);
  }

  getWhitelist(): Array<{ userId: string; label: string | null; level: 'owner' | 'trusted' }> {
    if (!this.database) return [];
    const rows = this.database.prepare('SELECT user_id, label, level FROM whitelist ORDER BY CASE level WHEN \'owner\' THEN 0 ELSE 1 END, created_at').all() as Array<{ user_id: string; label: string | null; level: 'owner' | 'trusted' }>;
    return rows.map(row => ({ userId: row.user_id, label: row.label, level: row.level }));
  }

  getWhitelistLevel(userId: string): 'owner' | 'trusted' | null {
    if (!this.database) return null;
    const row = this.database.prepare('SELECT level FROM whitelist WHERE user_id = ?').get(userId) as { level?: 'owner' | 'trusted' } | undefined;
    return row?.level ?? null;
  }

  upsertWhitelist(userId: string, level: 'owner' | 'trusted', label?: string): void {
    this.requireDatabase().prepare(`
      INSERT INTO whitelist (user_id, label, level) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET label = excluded.label, level = excluded.level
    `).run(userId, label ?? null, level);
  }

  removeWhitelist(userId: string): void {
    this.requireDatabase().prepare('DELETE FROM whitelist WHERE user_id = ?').run(userId);
  }

  incrementGameWin(userId: string): number {
    this.requireDatabase().prepare(`
      INSERT INTO game_wins (user_id, wins, updated_at) VALUES (?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET wins = wins + 1, updated_at = CURRENT_TIMESTAMP
    `).run(userId);
    return this.getGameWins(userId);
  }

  getGameWins(userId: string): number {
    if (!this.database) return 0;
    const row = this.database.prepare('SELECT wins FROM game_wins WHERE user_id = ?').get(userId) as { wins?: number } | undefined;
    return row?.wins ?? 0;
  }

  getIpProfile(guildId: string): { address: string; port: string; version: string; color: string; enabled: boolean } | null {
    if (!this.database) return null;
    const row = this.database.prepare('SELECT address, port, version, color, enabled FROM guild_ip_profiles WHERE guild_id = ?').get(guildId) as { address: string; port: string; version: string; color: string; enabled: number } | undefined;
    return row ? { address: row.address, port: row.port, version: row.version, color: row.color, enabled: row.enabled === 1 } : null;
  }

  setIpProfile(guildId: string, profile: { address: string; port: string; version: string; color: string; enabled: boolean }): void {
    this.requireDatabase().prepare(`
      INSERT INTO guild_ip_profiles (guild_id, address, port, version, color, enabled, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(guild_id) DO UPDATE SET
        address = excluded.address,
        port = excluded.port,
        version = excluded.version,
        color = excluded.color,
        enabled = excluded.enabled,
        updated_at = CURRENT_TIMESTAMP
    `).run(guildId, profile.address.trim(), profile.port.trim(), profile.version.trim(), profile.color, profile.enabled ? 1 : 0);
  }

  private openDatabase(directory: string): void {
    this.database?.close();
    this.dataDirectory = directory;
    this.database = new DatabaseSync(path.join(directory, 'caya.db'));
    this.database.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS secrets (
        name TEXT PRIMARY KEY,
        encrypted_value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (guild_id, key)
      );

      CREATE TABLE IF NOT EXISTS auto_replies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        trigger TEXT NOT NULL,
        response TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS blacklist (
        user_id TEXT PRIMARY KEY,
        reason TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS whitelist (
        user_id TEXT PRIMARY KEY,
        label TEXT,
        level TEXT NOT NULL DEFAULT 'trusted',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS game_wins (
        user_id TEXT PRIMARY KEY,
        wins INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS guild_ip_profiles (
        guild_id TEXT PRIMARY KEY,
        address TEXT NOT NULL,
        port TEXT NOT NULL,
        version TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#0099ff',
        enabled INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const insertDefaultSetting = this.database.prepare(`
      INSERT OR IGNORE INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `);
    for (const [key, value] of Object.entries(GLOBAL_SETTING_DEFAULTS)) {
      insertDefaultSetting.run(key, value);
    }

    const readSetting = this.database.prepare('SELECT value FROM settings WHERE key = ?');
    const updateSetting = this.database.prepare(`
      UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?
    `);

    const legacyOllamaModel = (readSetting.get('ollama_model') as { value?: string } | undefined)?.value?.trim() ?? '';
    if (legacyOllamaModel) {
      for (const key of ['ollama_chat_model', 'ollama_web_model', 'ollama_image_prompt_model']) {
        const current = (readSetting.get(key) as { value?: string } | undefined)?.value?.trim() ?? '';
        if (!current) updateSetting.run(legacyOllamaModel, key);
      }
    }

    const visionMigration = (readSetting.get('vision_model_migration_v2') as { value?: string } | undefined)?.value;
    if (visionMigration !== 'done') {
      const currentVision = (readSetting.get('ollama_vision_model') as { value?: string } | undefined)?.value?.trim() ?? '';
      const chatModel = (readSetting.get('ollama_chat_model') as { value?: string } | undefined)?.value?.trim() ?? '';
      if (currentVision && legacyOllamaModel && currentVision === legacyOllamaModel && chatModel === legacyOllamaModel) {
        updateSetting.run('', 'ollama_vision_model');
      }
      this.database.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('vision_model_migration_v2', 'done', CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = 'done', updated_at = CURRENT_TIMESTAMP`).run();
    }

    for (const promptKey of Object.keys(AI_PROMPT_DEFAULTS) as AiPromptKey[]) {
      const settingKey = AI_PROMPT_SETTING_KEYS[promptKey];
      const current = readSetting.get(settingKey) as { value?: string } | undefined;
      const legacyValues = AI_PROMPT_LEGACY_DEFAULTS[promptKey] ?? [];
      if (current?.value !== undefined && legacyValues.includes(current.value)) {
        updateSetting.run(AI_PROMPT_DEFAULTS[promptKey], settingKey);
      }
    }

    const seedCleanupDone = this.database.prepare('SELECT value FROM settings WHERE key = ?').get('seed_cleanup_v1') as { value?: string } | undefined;
    if (seedCleanupDone?.value !== 'done') {
      this.database.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('seed_cleanup_v1', 'done', CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = 'done', updated_at = CURRENT_TIMESTAMP
      `).run();
    }
  }

  private requireDatabase(): DatabaseSync {
    if (!this.database) throw new Error('Data directory has not been initialized.');
    return this.database;
  }

  private readBootstrap(): BootstrapConfig {
    if (!existsSync(this.bootstrapPath)) return {};
    try {
      return JSON.parse(readFileSync(this.bootstrapPath, 'utf8')) as BootstrapConfig;
    } catch {
      return {};
    }
  }

  private writeBootstrap(config: BootstrapConfig): void {
    writeFileSync(this.bootstrapPath, JSON.stringify(config, null, 2), 'utf8');
  }
}
