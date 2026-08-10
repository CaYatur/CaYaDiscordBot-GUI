import type { GuildMember } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import { DataStore } from './data-store.js';

export class AccessControlService {
  constructor(private readonly store: DataStore) {}

  getLevel(userId: string): 'owner' | 'trusted' | null {
    return this.store.getWhitelistLevel(userId);
  }

  isOwner(userId: string): boolean {
    return this.getLevel(userId) === 'owner';
  }

  isTrusted(userId: string): boolean {
    return this.getLevel(userId) !== null;
  }

  canBypassLinkFilter(userId: string): boolean {
    return this.isTrusted(userId);
  }

  canUseOwnerCommands(userId: string): boolean {
    return this.isOwner(userId);
  }

  canUseAdminTools(member: GuildMember | null, userId: string): boolean {
    return this.isTrusted(userId) || Boolean(member?.permissions.has(PermissionFlagsBits.Administrator));
  }
}
