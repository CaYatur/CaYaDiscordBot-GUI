import { safeStorage } from 'electron';
import { DataStore } from './data-store.js';

export class SecretService {
  constructor(private readonly store: DataStore) {}

  hasDiscordToken(): boolean {
    return Boolean(this.store.getSecret('discord_token'));
  }

  setDiscordToken(token: string): void {
    const normalized = token.trim();
    if (!normalized) throw new Error('Discord token cannot be empty.');
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure operating-system storage is not available.');
    }

    const encrypted = safeStorage.encryptString(normalized).toString('base64');
    this.store.setSecret('discord_token', encrypted);
  }

  getDiscordToken(): string | null {
    const encrypted = this.store.getSecret('discord_token');
    if (!encrypted) return null;
    if (!safeStorage.isEncryptionAvailable()) return null;

    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  }

  clearDiscordToken(): void {
    this.store.deleteSecret('discord_token');
  }
}
