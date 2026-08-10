import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type GuildTextBasedChannel,
  type Message,
  type User
} from 'discord.js';
import type { DataStore } from './data-store.js';

type RpsChoice = 'rock' | 'paper' | 'scissors';

interface RpsSession {
  id: string;
  channel: GuildTextBasedChannel;
  hostId: string;
  invited: Set<string>;
  accepted: Set<string>;
  players: string[];
  choices: Map<string, RpsChoice>;
  round: number;
  phase: 'invite' | 'round';
  timer: NodeJS.Timeout;
}

export class GamesService {
  private readonly rpsSessions = new Map<string, RpsSession>();

  constructor(private readonly store: DataStore) {}

  getActiveRpsCount(): number {
    return this.rpsSessions.size;
  }

  async startMultiplayerRps(message: Message, invitedUsers: User[]): Promise<string> {
    if (!message.inGuild()) throw new Error('Bu oyun yalnızca sunucularda kullanılabilir.');
    const channel = message.channel as GuildTextBasedChannel;
    const invitees = [...new Map(invitedUsers.filter(user => !user.bot && user.id !== message.author.id).map(user => [user.id, user])).values()];
    if (!invitees.length) throw new Error('Çok oyunculu oyun için en az bir kullanıcı etiketleyin.');
    if (invitees.length > 7) throw new Error('Bir oyunda en fazla 8 oyuncu olabilir.');
    const existing = [...this.rpsSessions.values()].find(session => session.players.includes(message.author.id) || invitees.some(user => session.players.includes(user.id)));
    if (existing) throw new Error('Oyunculardan biri zaten aktif bir Taş-Kağıt-Makas oturumunda.');

    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const players = [message.author.id, ...invitees.map(user => user.id)];
    const session: RpsSession = {
      id,
      channel,
      hostId: message.author.id,
      invited: new Set(invitees.map(user => user.id)),
      accepted: new Set([message.author.id]),
      players,
      choices: new Map(),
      round: 0,
      phase: 'invite',
      timer: setTimeout(() => undefined, 1)
    };
    session.timer = this.scheduleTimeout(session, 120_000, 'Oyun daveti zaman aşımına uğradı.');
    this.rpsSessions.set(id, session);

    await channel.send({
      content: `${invitees.map(user => `<@${user.id}>`).join(' ')} — <@${message.author.id}> sizi çok oyunculu **Taş-Kağıt-Makas** oyununa davet etti.`,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`game:rps:accept:${id}`).setLabel('Kabul Et').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`game:rps:reject:${id}`).setLabel('Reddet').setStyle(ButtonStyle.Danger)
      )]
    });
    return id;
  }

  async handleButton(interaction: ButtonInteraction): Promise<boolean> {
    const match = interaction.customId.match(/^game:rps:(accept|reject|rock|paper|scissors):([a-z0-9]+)$/i);
    if (!match) return false;
    const action = match[1].toLowerCase();
    const session = this.rpsSessions.get(match[2]);
    if (!session) {
      await interaction.reply({ content: 'Bu oyun oturumu artık aktif değil.', ephemeral: true });
      return true;
    }

    if (action === 'accept' || action === 'reject') {
      if (session.phase !== 'invite' || !session.invited.has(interaction.user.id)) {
        await interaction.reply({ content: 'Bu davet sizin için değil veya artık geçerli değil.', ephemeral: true });
        return true;
      }
      if (action === 'reject') {
        await interaction.reply({ content: 'Daveti reddettiniz.', ephemeral: true });
        await this.finishSession(session, `<@${interaction.user.id}> daveti reddetti. Oyun iptal edildi.`);
        return true;
      }
      session.accepted.add(interaction.user.id);
      await interaction.reply({ content: 'Oyuna katıldınız.', ephemeral: true });
      if ([...session.invited].every(userId => session.accepted.has(userId))) await this.startRound(session);
      return true;
    }

    if (session.phase !== 'round' || !session.players.includes(interaction.user.id)) {
      await interaction.reply({ content: 'Bu turda oyuncu değilsiniz.', ephemeral: true });
      return true;
    }
    if (session.choices.has(interaction.user.id)) {
      await interaction.reply({ content: 'Bu tur için seçiminizi zaten yaptınız.', ephemeral: true });
      return true;
    }

    const choice = action as RpsChoice;
    session.choices.set(interaction.user.id, choice);
    await interaction.reply({ content: `Seçiminiz kaydedildi: **${choiceLabel(choice)}**`, ephemeral: true });
    if (session.choices.size === session.players.length) await this.resolveRound(session);
    return true;
  }

  stopAll(): void {
    for (const session of this.rpsSessions.values()) clearTimeout(session.timer);
    this.rpsSessions.clear();
  }

  private async startRound(session: RpsSession): Promise<void> {
    clearTimeout(session.timer);
    session.phase = 'round';
    session.round += 1;
    session.choices.clear();
    session.timer = this.scheduleTimeout(session, 120_000, 'Tur seçimleri zaman aşımına uğradı. Oyun iptal edildi.');
    await session.channel.send({
      content: `**Taş-Kağıt-Makas · Tur ${session.round}**\n${session.players.map(id => `<@${id}>`).join(' ')} seçimlerinizi yapın. Seçimler diğer oyunculara gösterilmez.`,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`game:rps:rock:${session.id}`).setLabel('Taş').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`game:rps:paper:${session.id}`).setLabel('Kağıt').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`game:rps:scissors:${session.id}`).setLabel('Makas').setStyle(ButtonStyle.Primary)
      )]
    });
  }

  private async resolveRound(session: RpsSession): Promise<void> {
    clearTimeout(session.timer);
    const uniqueChoices = [...new Set(session.choices.values())];
    const summary = session.players.map(id => `<@${id}>: **${choiceLabel(session.choices.get(id)!)}**`).join('\n');

    if (uniqueChoices.length === 1 || uniqueChoices.length === 3) {
      await session.channel.send(`**Tur ${session.round} berabere.**\n${summary}\nAynı oyuncularla yeni tur başlıyor.`);
      await this.startRound(session);
      return;
    }

    const winningChoice = beats(uniqueChoices[0], uniqueChoices[1]) ? uniqueChoices[0] : uniqueChoices[1];
    const survivors = session.players.filter(id => session.choices.get(id) === winningChoice);
    const eliminated = session.players.filter(id => !survivors.includes(id));
    await session.channel.send(`**Tur ${session.round} sonucu**\n${summary}\n\nKazanan seçim: **${choiceLabel(winningChoice)}**\nElenenler: ${eliminated.map(id => `<@${id}>`).join(' ') || 'Yok'}`);
    session.players = survivors;

    if (session.players.length === 1) {
      const winnerId = session.players[0];
      const wins = this.store.incrementGameWin(winnerId);
      await this.finishSession(session, `Oyun bitti. Kazanan: <@${winnerId}> — toplam **${wins}** galibiyet.`);
      return;
    }
    await this.startRound(session);
  }

  private async finishSession(session: RpsSession, message: string): Promise<void> {
    clearTimeout(session.timer);
    this.rpsSessions.delete(session.id);
    await session.channel.send(message);
  }

  private scheduleTimeout(session: RpsSession, ms: number, message: string): NodeJS.Timeout {
    return setTimeout(() => {
      if (!this.rpsSessions.has(session.id)) return;
      this.rpsSessions.delete(session.id);
      void session.channel.send(message);
    }, ms);
  }
}

function beats(left: RpsChoice, right: RpsChoice): boolean {
  return (left === 'rock' && right === 'scissors') ||
    (left === 'paper' && right === 'rock') ||
    (left === 'scissors' && right === 'paper');
}

function choiceLabel(choice: RpsChoice): string {
  return choice === 'rock' ? 'Taş' : choice === 'paper' ? 'Kağıt' : 'Makas';
}
