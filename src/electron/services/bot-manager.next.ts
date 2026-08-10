import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type Message,
  type VoiceState
} from 'discord.js';
import type { BotStatus } from '../../shared/contracts.js';
import { AccessControlService } from './access-control.js';
import { AiService } from './ai-service.js';
import { DataStore } from './data-store.js';
import { GamesService } from './games-service.js';
import { MusicService } from './music-service.js';

const allowedLinks = [
  'youtube.com', 'youtu.be', 'discord.com', 'discord.gg', 'github.com', 'githubusercontent.com',
  'google.com', 'docs.google.com', 'drive.google.com', 'wikipedia.org', 'minecraft.net', 'steamcommunity.com'
];

const commands = [
  new SlashCommandBuilder().setName('random').setDescription('Rastgele sayı üretir.').addIntegerOption(o => o.setName('min').setDescription('Minimum').setRequired(true)).addIntegerOption(o => o.setName('max').setDescription('Maksimum').setRequired(true)),
  new SlashCommandBuilder().setName('avatar').setDescription('Bir kullanıcının avatarını gösterir.').addUserOption(o => o.setName('kullanici').setDescription('Kullanıcı').setRequired(false)),
  new SlashCommandBuilder().setName('avatarlink').setDescription('Avatar bağlantısını gönderir.').addUserOption(o => o.setName('kullanici').setDescription('Kullanıcı').setRequired(false)),
  new SlashCommandBuilder().setName('randomperson').setDescription('Sunucudan rastgele bir kullanıcı seçer.'),
  new SlashCommandBuilder().setName('status').setDescription('Bot durumunu gösterir.'),
  new SlashCommandBuilder().setName('yardim').setDescription('Komut yardımını gösterir.'),
  new SlashCommandBuilder().setName('ip').setDescription('Bu sunucu için kayıtlı IP profilini gösterir.'),
  new SlashCommandBuilder().setName('clear').setDescription('Mesajları temizler.').addIntegerOption(o => o.setName('miktar').setDescription('1-100').setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder().setName('cy').setDescription('Yönetim panelini gösterir.'),
  new SlashCommandBuilder().setName('join').setDescription('Botu bulunduğun ses kanalına bağlar.'),
  new SlashCommandBuilder().setName('stop').setDescription('Ses/müzik bağlantısını durdurur.'),
  new SlashCommandBuilder().setName('play').setDescription('Müzik oynatır veya sıraya ekler.').addStringOption(o => o.setName('sorgu').setDescription('YouTube URL veya arama').setRequired(true)),
  new SlashCommandBuilder().setName('pause').setDescription('Müziği duraklatır.'),
  new SlashCommandBuilder().setName('resume').setDescription('Müziği devam ettirir.'),
  new SlashCommandBuilder().setName('skip').setDescription('Geçerli parçayı atlar.'),
  new SlashCommandBuilder().setName('musicstop').setDescription('Müziği durdurur ve kuyruğu temizler.'),
  new SlashCommandBuilder().setName('bitrate').setDescription('Müzik bitrate ayarını değiştirir.').addIntegerOption(o => o.setName('deger').setDescription('48, 64, 96, 128, 192, 256 veya 320').setRequired(true)),
  new SlashCommandBuilder().setName('queue').setDescription('Çalma listesini gösterir.'),
  new SlashCommandBuilder().setName('nowplaying').setDescription('Şu an çalan parçayı gösterir.'),
  new SlashCommandBuilder().setName('otoyanit').setDescription('Otomatik yanıt ekler.').addStringOption(o => o.setName('mesaj').setDescription('Kullanıcı mesajı').setRequired(true)).addStringOption(o => o.setName('yanit').setDescription('Bot yanıtı').setRequired(true)),
  new SlashCommandBuilder().setName('otokapa').setDescription('Otomatik yanıtları listeler veya siler.').addIntegerOption(o => o.setName('numara').setDescription('Silinecek yanıt sıra numarası').setRequired(false).setMinValue(1)),
  new SlashCommandBuilder().setName('embed').setDescription('Özel embed oluşturur.').addStringOption(o => o.setName('baslik').setDescription('Başlık').setRequired(true)).addStringOption(o => o.setName('mesaj').setDescription('Mesaj').setRequired(true)).addStringOption(o => o.setName('altbaslik').setDescription('Alt başlık').setRequired(true)).addStringOption(o => o.setName('renk').setDescription('Hex renk, örn. #5865F2').setRequired(true)),
  new SlashCommandBuilder().setName('embedmsg').setDescription('Bir kullanıcıya özel embed DM gönderir.').addUserOption(o => o.setName('kullanici').setDescription('Kullanıcı').setRequired(true)).addStringOption(o => o.setName('baslik').setDescription('Başlık').setRequired(true)).addStringOption(o => o.setName('mesaj').setDescription('Mesaj').setRequired(true)).addStringOption(o => o.setName('altbaslik').setDescription('Alt başlık').setRequired(true)).addStringOption(o => o.setName('renk').setDescription('Hex renk').setRequired(true)),
  new SlashCommandBuilder().setName('linkengel').setDescription('Link filtresini açar veya kapatır.').addStringOption(o => o.setName('durum').setDescription('Durum').setRequired(true).addChoices({ name: 'Aç', value: 'on' }, { name: 'Kapat', value: 'off' })),
  new SlashCommandBuilder().setName('help').setDescription('Yardım ve destek bilgisini gösterir.'),
  new SlashCommandBuilder().setName('servicepolicy').setDescription('Hizmet şartları ve gizlilik bilgisini gösterir.'),
  new SlashCommandBuilder().setName('rps').setDescription('Taş kağıt makas oynar.').addStringOption(o => o.setName('secim').setDescription('Seçimin').setRequired(true).addChoices({ name: 'Taş', value: 'rock' }, { name: 'Kağıt', value: 'paper' }, { name: 'Makas', value: 'scissors' })),
  new SlashCommandBuilder().setName('kura').setDescription('Virgülle ayrılmış seçeneklerden kura çeker.').addStringOption(o => o.setName('secenekler').setDescription('Ali, Ayşe, Mehmet').setRequired(true))
].map(command => command.toJSON());

export class BotManager {
  private client: Client | null = null;
  private connectionState: BotStatus['state'] = 'offline';
  private lastError: string | null = null;
  private readonly access: AccessControlService;
  private readonly music: MusicService;
  private readonly games: GamesService;
  private readonly ai: AiService;
  private readonly logs: Array<{ time: string; level: 'info' | 'warn' | 'error'; message: string }> = [];
  private readonly pendingRoleActions = new Map<string, { guildId: string; requesterId: string; targetId: string; roleId: string; expiresAt: number }>();
  private readonly emptyVoiceTimers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly store: DataStore) {
    this.access = new AccessControlService(store);
    this.music = new MusicService(store, (level, message) => this.log(level, message));
    this.games = new GamesService(store);
    this.ai = new AiService(store, (level, message) => this.log(level, message));
  }

  getStatus(): BotStatus {
    const client = this.client;
    return {
      state: this.connectionState,
      userTag: client?.user?.tag ?? null,
      guildCount: client?.guilds.cache.size ?? 0,
      ping: Number.isFinite(client?.ws.ping) ? Math.max(0, Math.round(client?.ws.ping ?? 0)) : null,
      lastError: this.lastError
    };
  }

  getGuilds(): Array<{ id: string; name: string; memberCount: number; iconUrl: string | null }> {
    if (!this.client) return [];
    return [...this.client.guilds.cache.values()].map(guild => ({
      id: guild.id,
      name: guild.name,
      memberCount: guild.memberCount,
      iconUrl: guild.iconURL({ size: 128 })
    })).sort((a, b) => a.name.localeCompare(b.name));
  }

  getLogs(): Array<{ time: string; level: 'info' | 'warn' | 'error'; message: string }> {
    return [...this.logs].reverse();
  }

  getMusicQueue(guildId: string) {
    return this.music.getQueue(guildId);
  }

  async setMusicBitrate(guildId: string, value: number): Promise<number> {
    return this.music.setBitrate(guildId, value);
  }

  testOllamaConnection(url: string) {
    return this.ai.testOllamaConnection(url);
  }

  testComfyConnection(url: string) {
    return this.ai.testComfyConnection(url);
  }

  getOllamaModels(url: string) {
    return this.ai.getOllamaModels(url);
  }

  getOllamaModelCatalog(url: string) {
    return this.ai.getOllamaModelCatalog(url);
  }

  getComfyCheckpoints(url: string) {
    return this.ai.getComfyCheckpoints(url);
  }

  private log(level: 'info' | 'warn' | 'error', message: string): void {
    this.logs.push({ time: new Date().toISOString(), level, message });
    if (this.logs.length > 500) this.logs.splice(0, this.logs.length - 500);
  }

  async start(token: string): Promise<BotStatus> {
    if (this.client) await this.stop();
    this.connectionState = 'connecting';
    this.lastError = null;
    this.log('info', 'Discord bot connection is starting.');

    const client = new Client({ intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildPresences,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.MessageContent
    ] });
    this.client = client;

    client.once(Events.ClientReady, async readyClient => {
      this.connectionState = 'online';
      this.lastError = null;
      this.log('info', `Discord connected as ${readyClient.user.tag}; ${readyClient.guilds.cache.size} guild(s).`);
      try {
        await readyClient.application.commands.set(commands);
        this.log('info', `${commands.length} slash command(s) registered.`);
      } catch (error) {
        this.lastError = `Command registration: ${toErrorMessage(error)}`;
        this.log('error', this.lastError);
      }
    });
    client.on(Events.Error, error => {
      this.lastError = error.message;
      this.log('error', `Discord client error: ${error.message}`);
    });
    client.on(Events.InteractionCreate, interaction => {
      if (interaction.isChatInputCommand()) {
        void this.handleSlash(interaction).catch(error => this.log('error', `Slash command ${interaction.commandName} failed: ${toErrorMessage(error)}`));
      }
      if (interaction.isButton()) {
        void this.handleButton(interaction).catch(error => this.log('error', `Button ${interaction.customId} failed: ${toErrorMessage(error)}`));
      }
    });
    client.on(Events.MessageCreate, message => {
      void this.handleMessage(message).catch(error => this.log('error', `Message handler failed for ${message.author.tag}: ${toErrorMessage(error)}`));
    });
    client.on(Events.VoiceStateUpdate, (oldState, newState) => {
      this.handleVoiceStateUpdate(oldState, newState);
    });

    try {
      await client.login(token);
      return this.getStatus();
    } catch (error) {
      this.connectionState = 'error';
      this.lastError = toErrorMessage(error);
      this.log('error', `Discord login failed: ${this.lastError}`);
      client.destroy();
      this.client = null;
      return this.getStatus();
    }
  }

  async stop(): Promise<BotStatus> {
    this.music.stopAll();
    this.games.stopAll();
    for (const timer of this.emptyVoiceTimers.values()) clearTimeout(timer);
    this.emptyVoiceTimers.clear();
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    this.connectionState = 'offline';
    this.lastError = null;
    return this.getStatus();
  }

  private handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): void {
    const guild = newState.guild ?? oldState.guild;
    const guildId = guild.id;
    const connectedChannelId = this.music.getConnectedChannelId(guildId);
    if (!connectedChannelId) {
      this.clearEmptyVoiceTimer(guildId);
      return;
    }

    const botId = this.client?.user?.id;
    if (botId && (oldState.id === botId || newState.id === botId) && newState.channelId !== connectedChannelId) {
      this.clearEmptyVoiceTimer(guildId);
      this.music.stop(guildId);
      this.log('warn', `Bot voice state changed unexpectedly in ${guild.name}; music state was cleared.`);
      return;
    }

    const channel = guild.channels.cache.get(connectedChannelId);
    if (!channel?.isVoiceBased()) {
      this.clearEmptyVoiceTimer(guildId);
      return;
    }
    const humanCount = channel.members.filter(member => !member.user.bot).size;
    if (humanCount > 0) {
      this.clearEmptyVoiceTimer(guildId);
      return;
    }
    if (this.emptyVoiceTimers.has(guildId)) return;

    const timer = setTimeout(() => {
      this.emptyVoiceTimers.delete(guildId);
      const currentChannelId = this.music.getConnectedChannelId(guildId);
      if (!currentChannelId) return;
      const currentChannel = guild.channels.cache.get(currentChannelId);
      if (!currentChannel?.isVoiceBased()) return;
      const stillEmpty = currentChannel.members.filter(member => !member.user.bot).size === 0;
      if (stillEmpty && this.music.stop(guildId)) {
        this.log('info', `Left empty voice channel ${currentChannel.name} in ${guild.name} after 5 minutes.`);
      }
    }, 5 * 60_000);
    this.emptyVoiceTimers.set(guildId, timer);
    this.log('info', `Voice channel ${channel.name} is empty; 5-minute auto-leave timer started.`);
  }

  private clearEmptyVoiceTimer(guildId: string): void {
    const timer = this.emptyVoiceTimers.get(guildId);
    if (timer) clearTimeout(timer);
    this.emptyVoiceTimers.delete(guildId);
  }

  private async handleSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild || !interaction.guildId) return;
    if (this.store.isBlacklisted(interaction.user.id)) {
      await interaction.reply({ content: 'Bu botu kullanma yetkiniz bulunmuyor.', ephemeral: true });
      return;
    }

    try {
      switch (interaction.commandName) {
        case 'random': {
          let min = interaction.options.getInteger('min', true);
          let max = interaction.options.getInteger('max', true);
          if (min > max) [min, max] = [max, min];
          const value = Math.floor(Math.random() * (max - min + 1)) + min;
          await interaction.reply(`Sonuç: **${value}**`);
          break;
        }
        case 'avatar': {
          const user = interaction.options.getUser('kullanici') ?? interaction.user;
          await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${user.username} avatar`).setImage(user.displayAvatarURL({ size: 1024 })).setColor(0x5865f2)] });
          break;
        }
        case 'avatarlink': {
          const user = interaction.options.getUser('kullanici') ?? interaction.user;
          await interaction.reply(user.displayAvatarURL({ size: 4096 }));
          break;
        }
        case 'randomperson': {
          await interaction.guild.members.fetch();
          const members = [...interaction.guild.members.cache.values()].filter(m => !m.user.bot);
          const member = members[Math.floor(Math.random() * members.length)];
          await interaction.reply(member ? `Seçilen kişi: ${member}` : 'Uygun kullanıcı bulunamadı.');
          break;
        }
        case 'status': {
          const s = this.getStatus();
          await interaction.reply({ embeds: [new EmbedBuilder().setTitle('CaYa Bot Status').setColor(0x5865f2).addFields(
            { name: 'Durum', value: s.state, inline: true },
            { name: 'Ping', value: s.ping === null ? '-' : `${s.ping} ms`, inline: true },
            { name: 'Sunucu', value: String(s.guildCount), inline: true },
            { name: 'Çalışma süresi', value: formatDuration(process.uptime()), inline: true }
          )] });
          break;
        }
        case 'yardim': {
          await interaction.reply({ embeds: [new EmbedBuilder().setTitle('CaYa Bot Komutları').setColor(0x5865f2).setDescription('/random /avatar /avatarlink /randomperson /status /ip /clear /cy /join /stop /play /pause /resume /skip /musicstop /bitrate /rps /kura')] });
          break;
        }
        case 'ip': {
          const profile = this.store.getIpProfile(interaction.guildId);
          if (!profile?.enabled) await interaction.reply({ content: 'Bu sunucu için IP profili tanımlı değil.', ephemeral: true });
          else await interaction.reply({ embeds: [new EmbedBuilder().setTitle('Sunucu Bilgileri').setColor(profile.color as `#${string}`).addFields(
            { name: 'Adres', value: profile.address, inline: true }, { name: 'Port', value: profile.port, inline: true }, { name: 'Sürüm', value: profile.version }
          )] });
          break;
        }
        case 'clear': {
          const member = interaction.member as GuildMember;
          if (!this.access.canUseAdminTools(member, interaction.user.id)) return void await interaction.reply({ content: 'Yetkiniz yok.', ephemeral: true });
          const amount = interaction.options.getInteger('miktar', true);
          if (!interaction.channel?.isTextBased() || !('bulkDelete' in interaction.channel)) throw new Error('Bu kanalda toplu silme desteklenmiyor.');
          const deleted = await interaction.channel.bulkDelete(amount, true);
          await interaction.reply({ content: `${deleted.size} mesaj silindi.`, ephemeral: true });
          break;
        }
        case 'cy': {
          const member = interaction.member as GuildMember;
          if (!this.access.canUseAdminTools(member, interaction.user.id)) return void await interaction.reply({ content: 'Yetkiniz yok.', ephemeral: true });
          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('caya_members').setLabel('Üyeler').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('caya_settings').setLabel('Ayarlar').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('caya_stats').setLabel('İstatistik').setStyle(ButtonStyle.Primary)
          );
          await interaction.reply({ embeds: [new EmbedBuilder().setTitle('CaYa Yönetim Paneli').setColor(0x5865f2).setDescription(`Sunucu: ${interaction.guild.name}`)], components: [row], ephemeral: true });
          break;
        }
        case 'join': {
          const member = interaction.member as GuildMember;
          const channelName = this.music.join(member);
          await interaction.reply({ content: `Ses kanalına bağlanıldı: **${channelName}**`, ephemeral: true });
          break;
        }
        case 'stop':
        case 'musicstop': {
          const member = interaction.member as GuildMember;
          this.music.assertCanControl(member);
          await interaction.reply(this.music.stop(interaction.guildId) ? 'Müzik durduruldu ve bağlantı kapatıldı.' : 'Aktif müzik bağlantısı yok.');
          break;
        }
        case 'play': {
          await interaction.deferReply();
          const result = await this.music.play(interaction.member as GuildMember, interaction.options.getString('sorgu', true), interaction.user.id);
          await interaction.editReply(result.queued ? `Sıraya eklendi: **${result.title}**` : `Oynatılıyor: **${result.title}**`);
          break;
        }
        case 'pause': {
          const member = interaction.member as GuildMember;
          this.music.assertCanControl(member);
          await interaction.reply(this.music.pause(interaction.guildId) ? 'Müzik duraklatıldı.' : 'Duraklatılacak müzik yok.');
          break;
        }
        case 'resume': {
          const member = interaction.member as GuildMember;
          this.music.assertCanControl(member);
          await interaction.reply(this.music.resume(interaction.guildId) ? 'Müzik devam ediyor.' : 'Devam ettirilecek müzik yok.');
          break;
        }
        case 'skip': {
          const member = interaction.member as GuildMember;
          this.music.assertCanControl(member);
          await interaction.reply(this.music.skip(interaction.guildId) ? 'Parça atlandı.' : 'Atlanacak parça yok.');
          break;
        }
        case 'bitrate': {
          const member = interaction.member as GuildMember;
          if (!this.access.canUseAdminTools(member, interaction.user.id)) return void await interaction.reply({ content: 'Yetkiniz yok.', ephemeral: true });
          if (this.music.getConnectedChannelId(interaction.guildId)) this.music.assertCanControl(member);
          const bitrate = await this.music.setBitrate(interaction.guildId, interaction.options.getInteger('deger', true));
          await interaction.reply(`Bitrate ${bitrate} kbps olarak uygulandı.`);
          break;
        }
        case 'queue': {
          const queue = this.music.getQueue(interaction.guildId);
          const description = queue.length ? queue.map((item, index) => `${index + 1}. **${item.title}**`).join('\n').slice(0, 3900) : 'Çalma listesi boş.';
          await interaction.reply({ embeds: [new EmbedBuilder().setTitle('Çalma Listesi').setDescription(description).setColor(0x5865f2)], components: [buildMusicControlsRow()], ephemeral: true });
          break;
        }
        case 'nowplaying': {
          const current = this.music.getNowPlaying(interaction.guildId);
          if (!current) return void await interaction.reply({ content: 'Şu an hiçbir parça çalmıyor.', ephemeral: true });
          await interaction.reply({ embeds: [new EmbedBuilder().setTitle('Şimdi Çalıyor').setDescription(`**${current.title}**`).addFields({ name: 'İsteyen', value: `<@${current.requestedBy}>` }).setColor(0x5865f2)], components: [buildMusicControlsRow()], ephemeral: true });
          break;
        }
        case 'otoyanit': {
          const member = interaction.member as GuildMember;
          if (!this.access.canUseAdminTools(member, interaction.user.id)) return void await interaction.reply({ content: 'Yetkiniz yok.', ephemeral: true });
          const trigger = interaction.options.getString('mesaj', true).trim();
          const response = interaction.options.getString('yanit', true).trim();
          const exists = this.store.getAutoReplies(interaction.guildId).some(item => item.trigger.toLocaleLowerCase('tr') === trigger.toLocaleLowerCase('tr'));
          if (exists) return void await interaction.reply({ content: 'Bu otomatik yanıt zaten kayıtlı.', ephemeral: true });
          this.store.addAutoReply(interaction.guildId, trigger, response);
          await interaction.reply({ content: 'Otomatik yanıt eklendi.', ephemeral: true });
          break;
        }
        case 'otokapa': {
          const member = interaction.member as GuildMember;
          if (!this.access.canUseAdminTools(member, interaction.user.id)) return void await interaction.reply({ content: 'Yetkiniz yok.', ephemeral: true });
          const replies = this.store.getAutoReplies(interaction.guildId);
          const number = interaction.options.getInteger('numara');
          if (number !== null) {
            const target = replies[number - 1];
            if (!target) return void await interaction.reply({ content: 'Geçersiz numara.', ephemeral: true });
            this.store.deleteAutoReply(target.id);
            await interaction.reply({ content: `Otomatik yanıt silindi: ${target.trigger}`, ephemeral: true });
          } else {
            const description = replies.length ? replies.map((item, index) => `${index + 1}. **${item.trigger}** → ${item.response}`).join('\n').slice(0, 3900) : 'Henüz otomatik yanıt yok.';
            await interaction.reply({ embeds: [new EmbedBuilder().setTitle('Otomatik Yanıtlar').setDescription(description).setColor(0x5865f2)], ephemeral: true });
          }
          break;
        }
        case 'embed': {
          const member = interaction.member as GuildMember;
          if (!this.access.canUseAdminTools(member, interaction.user.id)) return void await interaction.reply({ content: 'Yetkiniz yok.', ephemeral: true });
          const color = interaction.options.getString('renk', true);
          if (!/^#[0-9a-f]{6}$/i.test(color)) return void await interaction.reply({ content: 'Geçerli bir 6 haneli hex renk girin.', ephemeral: true });
          await interaction.reply({ embeds: [new EmbedBuilder().setTitle(interaction.options.getString('baslik', true)).setDescription(interaction.options.getString('mesaj', true)).setFooter({ text: interaction.options.getString('altbaslik', true) }).setColor(color as `#${string}`)] });
          break;
        }
        case 'embedmsg': {
          const member = interaction.member as GuildMember;
          if (!this.access.canUseAdminTools(member, interaction.user.id)) return void await interaction.reply({ content: 'Yetkiniz yok.', ephemeral: true });
          const user = interaction.options.getUser('kullanici', true);
          if (user.bot) return void await interaction.reply({ content: 'Bot hesaplarına özel embed gönderilmez.', ephemeral: true });
          const color = interaction.options.getString('renk', true);
          if (!/^#[0-9a-f]{6}$/i.test(color)) return void await interaction.reply({ content: 'Geçerli bir 6 haneli hex renk girin.', ephemeral: true });
          await user.send({ embeds: [new EmbedBuilder().setTitle(interaction.options.getString('baslik', true)).setDescription(interaction.options.getString('mesaj', true)).setFooter({ text: interaction.options.getString('altbaslik', true) }).setColor(color as `#${string}`)] });
          await interaction.reply({ content: `${user.tag} kullanıcısına mesaj gönderildi.`, ephemeral: true });
          break;
        }
        case 'linkengel': {
          const member = interaction.member as GuildMember;
          if (!this.access.canUseAdminTools(member, interaction.user.id)) return void await interaction.reply({ content: 'Yetkiniz yok.', ephemeral: true });
          const enabled = interaction.options.getString('durum', true) === 'on';
          this.store.setGuildSetting(interaction.guildId, 'link_filter', String(enabled));
          await interaction.reply({ content: `Link filtresi ${enabled ? 'açıldı' : 'kapatıldı'}.`, ephemeral: true });
          break;
        }
        case 'help': {
          await interaction.reply({ embeds: [new EmbedBuilder().setTitle('CaYa Bot Yardım').setDescription('/otoyanit /otokapa /embed /embedmsg /linkengel /play /stop /skip /queue /nowplaying /random /avatar /avatarlink /randomperson /status /ip /clear /cy /join /pause /resume /bitrate /rps /kura').setColor(0x5865f2)], ephemeral: true });
          break;
        }
        case 'servicepolicy': {
          await interaction.reply({ embeds: [new EmbedBuilder().setTitle('Hizmet Şartları ve Gizlilik').setDescription('Botu kötüye kullanmayın ve diğer kullanıcılara saygılı olun. Uygulama ayarları ve bot verileri seçtiğiniz yerel veri klasöründe saklanır; Discord tokenı işletim sistemi destekli güvenli depolamayla şifrelenir.').setColor(0x5865f2)], ephemeral: true });
          break;
        }
        case 'rps': {
          const choice = interaction.options.getString('secim', true) as 'rock' | 'paper' | 'scissors';
          const choices = ['rock', 'paper', 'scissors'] as const;
          const botChoice = choices[Math.floor(Math.random() * choices.length)];
          const win = (choice === 'rock' && botChoice === 'scissors') || (choice === 'paper' && botChoice === 'rock') || (choice === 'scissors' && botChoice === 'paper');
          const draw = choice === botChoice;
          const wins = win ? this.store.incrementGameWin(interaction.user.id) : this.store.getGameWins(interaction.user.id);
          await interaction.reply(`Sen: **${choice}** | Bot: **${botChoice}** | ${draw ? 'Berabere' : win ? 'Kazandın' : 'Kaybettin'} | Toplam galibiyet: **${wins}**`);
          break;
        }
        case 'kura': {
          const items = interaction.options.getString('secenekler', true).split(',');
          const clean = items.map(v => v.trim()).filter(Boolean);
          if (clean.length < 2) return void await interaction.reply({ content: 'En az iki seçenek girin.', ephemeral: true });
          await interaction.reply(`Kura sonucu: **${clean[Math.floor(Math.random() * clean.length)]}**`);
          break;
        }
      }
    } catch (error) {
      const message = toErrorMessage(error);
      this.log('error', `Slash command ${interaction.commandName} failed: ${message}`);
      const content = `Hata: ${message}`.slice(0, 1900);
      if (interaction.deferred || interaction.replied) await interaction.editReply(content).catch(() => undefined);
      else await interaction.reply({ content, ephemeral: true }).catch(() => undefined);
    }
  }

  private async handleButton(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.guild) return;

    if (await this.games.handleButton(interaction)) return;

    if (interaction.customId.startsWith('action_confirm:') || interaction.customId.startsWith('action_cancel:')) {
      await this.handleRoleActionButton(interaction);
      return;
    }

    if (['music_pause', 'music_resume', 'music_skip', 'music_stop'].includes(interaction.customId) && !this.music.canControl(interaction.member as GuildMember)) {
      await interaction.reply({ content: 'Bu kontrol için botla aynı ses kanalında olmalısınız.', ephemeral: true });
      return;
    }

    if (interaction.customId === 'music_pause') {
      this.music.assertCanControl(interaction.member as GuildMember);
      await interaction.reply({ content: this.music.pause(interaction.guild.id) ? 'Müzik duraklatıldı.' : 'Duraklatılacak müzik yok.', ephemeral: true });
      return;
    }
    if (interaction.customId === 'music_resume') {
      this.music.assertCanControl(interaction.member as GuildMember);
      await interaction.reply({ content: this.music.resume(interaction.guild.id) ? 'Müzik devam ediyor.' : 'Devam ettirilecek müzik yok.', ephemeral: true });
      return;
    }
    if (interaction.customId === 'music_skip') {
      this.music.assertCanControl(interaction.member as GuildMember);
      await interaction.reply({ content: this.music.skip(interaction.guild.id) ? 'Parça atlandı.' : 'Atlanacak parça yok.', ephemeral: true });
      return;
    }
    if (interaction.customId === 'music_stop') {
      this.music.assertCanControl(interaction.member as GuildMember);
      await interaction.reply({ content: this.music.stop(interaction.guild.id) ? 'Müzik durduruldu.' : 'Aktif müzik yok.', ephemeral: true });
      return;
    }
    if (interaction.customId === 'music_queue') {
      const queue = this.music.getQueue(interaction.guild.id);
      const description = queue.length ? queue.map((item, index) => `${index + 1}. **${item.title}**`).join('\n').slice(0, 3900) : 'Çalma listesi boş.';
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('Çalma Listesi').setDescription(description).setColor(0x5865f2)], ephemeral: true });
      return;
    }
    if (interaction.customId === 'music_nowplaying') {
      const current = this.music.getNowPlaying(interaction.guild.id);
      if (!current) return void await interaction.reply({ content: 'Şu an hiçbir parça çalmıyor.', ephemeral: true });
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('Şimdi Çalıyor').setDescription(`**${current.title}**`).setColor(0x5865f2)], ephemeral: true });
      return;
    }

    const member = interaction.member as GuildMember;
    if (!this.access.canUseAdminTools(member, interaction.user.id)) return void await interaction.reply({ content: 'Yetkiniz yok.', ephemeral: true });
    if (interaction.customId === 'caya_members') {
      await interaction.reply({ content: `Üye sayısı: ${interaction.guild.memberCount}`, ephemeral: true });
    } else if (interaction.customId === 'caya_settings') {
      const bitrate = this.music.getBitrate(interaction.guild.id);
      await interaction.reply({ content: `Müzik bitrate: ${bitrate} kbps\nLink filtresi: ${this.store.getGuildSetting(interaction.guild.id, 'link_filter') === 'true' ? 'Açık' : 'Kapalı'}`, ephemeral: true });
    } else if (interaction.customId === 'caya_stats') {
      await interaction.reply({ content: `Bot ping: ${this.client?.ws.ping ?? 0} ms`, ephemeral: true });
    }
  }

  private async handleMessage(message: Message): Promise<void> {
    if (!message.guild || message.author.bot) return;
    if (this.store.isBlacklisted(message.author.id)) return;

    if (await this.handleOwnerMessageCommands(message)) return;
    if (await this.handleAdminMessageCommands(message)) return;
    if (await this.handleLegacyCommands(message)) return;
    if (await this.ai.handleMessage(this.client!, message)) return;

    const content = message.content.trim();
    const autoReply = this.store.getAutoReplies(message.guild.id).find(item => item.enabled && item.trigger.toLocaleLowerCase('tr') === content.toLocaleLowerCase('tr'));
    if (autoReply) {
      await message.reply(autoReply.response);
      return;
    }

    if (this.store.getGuildSetting(message.guild.id, 'link_filter') !== 'true') return;
    if (this.access.canUseAdminTools(message.member, message.author.id)) return;
    const urls = content.match(/https?:\/\/[^\s]+/gi) ?? [];
    const disallowed = urls.some(url => !isAllowedUrl(url));
    if (disallowed) {
      await message.delete().catch(() => undefined);
      if (message.member?.moderatable) {
        await message.member.timeout(40000, 'CaYa link filter').catch(() => undefined);
      }
      this.log('warn', `Link filter removed a message from ${message.author.tag} in ${message.guild.name}.`);
      if ('send' in message.channel && typeof message.channel.send === 'function') {
        const sent = await message.channel.send(`${message.author}, bu sunucuda bu bağlantıya izin verilmiyor.`);
        setTimeout(() => void sent.delete().catch(() => undefined), 5000);
      }
    }
  }

  private async handleLegacyCommands(message: Message): Promise<boolean> {
    if (!message.guild) return false;
    const content = message.content.trim();
    const lower = content.toLocaleLowerCase('tr');

    if (lower.startsWith('c!p ') || lower.startsWith('c!play ')) {
      const query = content.slice(lower.startsWith('c!play ') ? 7 : 4).trim();
      if (!query) { await message.reply('Lütfen YouTube bağlantısı veya şarkı adı yazın.'); return true; }
      try {
        const result = await this.music.play(message.member as GuildMember, query, message.author.id);
        await message.reply(result.queued ? `Sıraya eklendi: **${result.title}**` : `Oynatılıyor: **${result.title}**`);
      } catch (error) { await message.reply(`Müzik hatası: ${toErrorMessage(error)}`.slice(0, 1900)); }
      return true;
    }
    if (lower === 'c!s' || lower === 'c!stop') {
      try {
        this.music.assertCanControl(message.member as GuildMember);
        await message.reply(this.music.stop(message.guild.id) ? 'Müzik durduruldu.' : 'Aktif müzik yok.');
      } catch (error) { await message.reply(toErrorMessage(error)); }
      return true;
    }
    if (lower === 'c!skip') {
      try {
        this.music.assertCanControl(message.member as GuildMember);
        await message.reply(this.music.skip(message.guild.id) ? 'Parça atlandı.' : 'Atlanacak parça yok.');
      } catch (error) { await message.reply(toErrorMessage(error)); }
      return true;
    }
    if (lower === 'c!queue') {
      const queue = this.music.getQueue(message.guild.id);
      const description = queue.length ? queue.map((item, index) => `${index + 1}. **${item.title}**`).join('\n').slice(0, 3900) : 'Çalma listesi boş.';
      await message.reply({ embeds: [new EmbedBuilder().setTitle('Çalma Listesi').setDescription(description).setColor(0x5865f2)], components: [buildMusicControlsRow()] });
      return true;
    }
    if (lower === 'c!nowplaying') {
      const current = this.music.getNowPlaying(message.guild.id);
      if (!current) { await message.reply('Şu an hiçbir parça çalmıyor.'); return true; }
      await message.reply({ embeds: [new EmbedBuilder().setTitle('Şimdi Çalıyor').setDescription(`**${current.title}**`).setColor(0x5865f2)], components: [buildMusicControlsRow()] });
      return true;
    }
    if (lower.startsWith('c!bitrate') || lower.startsWith('c!kalite')) {
      if (!this.access.canUseAdminTools(message.member, message.author.id)) { await message.reply('Bu komut için yönetim yetkisi gerekir.'); return true; }
      const raw = content.split(/\s+/)[1]?.toLowerCase();
      if (!raw) { await message.reply(`Mevcut bitrate: **${this.music.getBitrate(message.guild.id)} kbps**`); return true; }
      const value = raw === 'full' || raw === 'max' ? 256 : raw === 'low' ? 64 : raw === 'default' ? 96 : Number(raw);
      if (!Number.isFinite(value)) { await message.reply('Geçerli bir bitrate değeri girin.'); return true; }
      try {
        if (this.music.getConnectedChannelId(message.guild.id)) this.music.assertCanControl(message.member as GuildMember);
        const bitrate = await this.music.setBitrate(message.guild.id, value);
        await message.reply(`Bitrate **${bitrate} kbps** olarak uygulandı.`);
      } catch (error) { await message.reply(toErrorMessage(error)); }
      return true;
    }
    if (lower === 'c!wins' || lower.startsWith('c!wins ')) {
      const user = message.mentions.users.first() ?? message.author;
      await message.reply(`${user} kullanıcısının **${this.store.getGameWins(user.id)}** galibiyeti var.`);
      return true;
    }
    if (lower === 'c!help') {
      await message.reply({ embeds: [new EmbedBuilder().setTitle('CaYaBot Yardım').setColor(0x5865f2).setDescription('c!p / c!play, c!s / c!stop, c!skip, c!queue, c!nowplaying, c!bitrate / c!kalite, c!wins, c!taşkağıtmakas, !ip, /help')] });
      return true;
    }
    if (lower === '!ip' || lower === 'c!ip') {
      const profile = this.store.getIpProfile(message.guild.id);
      if (!profile?.enabled) { await message.reply('Bu sunucu için IP profili tanımlı değil.'); return true; }
      await message.reply({ embeds: [new EmbedBuilder().setTitle('Sunucu IP Bilgileri').setColor(profile.color as `#${string}`).addFields({ name: 'Adres', value: profile.address }, { name: 'Port', value: profile.port }, { name: 'Sürüm', value: profile.version })] });
      return true;
    }
    if (lower === '!bot') { await message.reply('Merhaba!'); return true; }
    if (lower.startsWith('c!taşkağıtmakas')) {
      const invitees = [...message.mentions.users.values()].filter(user => user.id !== message.author.id && !user.bot);
      if (invitees.length) {
        try { await this.games.startMultiplayerRps(message, invitees); }
        catch (error) { await message.reply(toErrorMessage(error)); }
      } else {
        await this.startLegacyRps(message);
      }
      return true;
    }
    return false;
  }

  private async startLegacyRps(message: Message): Promise<void> {
    const choices = ['taş', 'kağıt', 'makas'] as const;
    const input = message.content.trim().split(/\s+/)[1]?.toLocaleLowerCase('tr');
    if (!input || !choices.includes(input as (typeof choices)[number])) {
      await message.reply('Kullanım: `c!taşkağıtmakas taş|kağıt|makas` veya çok oyunculu için `c!taşkağıtmakas @kullanıcı @kullanıcı...`');
      return;
    }

    const userChoice = input as (typeof choices)[number];
    const botChoice = choices[Math.floor(Math.random() * choices.length)];
    const win = (userChoice === 'taş' && botChoice === 'makas') ||
      (userChoice === 'kağıt' && botChoice === 'taş') ||
      (userChoice === 'makas' && botChoice === 'kağıt');
    const draw = userChoice === botChoice;
    const wins = win ? this.store.incrementGameWin(message.author.id) : this.store.getGameWins(message.author.id);
    await message.reply(`Sen: **${userChoice}** | Bot: **${botChoice}** | ${draw ? 'Berabere' : win ? 'Kazandın' : 'Kaybettin'} | Toplam galibiyet: **${wins}**`);
  }

  private async handleOwnerMessageCommands(message: Message): Promise<boolean> {
    if (!message.guild || !this.access.canUseOwnerCommands(message.author.id)) return false;
    const [command, ...args] = message.content.trim().split(/\s+/);
    if (command === '!blacklist') {
      const user = message.mentions.users.first();
      if (!user) return void await message.reply('Bir kullanıcı etiketleyin.') as unknown as boolean;
      this.store.addBlacklist(user.id, args.slice(1).join(' ') || 'Owner command');
      await message.reply(`${user.tag} kara listeye eklendi.`);
      return true;
    }
    if (command === '!unblacklist') {
      const user = message.mentions.users.first();
      if (!user) return void await message.reply('Bir kullanıcı etiketleyin.') as unknown as boolean;
      this.store.removeBlacklist(user.id);
      await message.reply(`${user.tag} kara listeden çıkarıldı.`);
      return true;
    }
    if (command === '!giveadmin') {
      const member = message.mentions.members?.first();
      if (!member) { await message.reply('Bir kullanıcı etiketleyin.'); return true; }
      const role = message.guild.roles.cache.find(r => r.name === 'YÖNETİCİ') ?? await message.guild.roles.create({ name: 'YÖNETİCİ', permissions: [PermissionFlagsBits.Administrator], reason: 'CaYa owner command' });
      await member.roles.add(role);
      await message.reply(`${member.user.tag} yönetici rolü aldı.`);
      return true;
    }
    return false;
  }

  private async handleAdminMessageCommands(message: Message): Promise<boolean> {
    const member = message.member;
    const [command, ...args] = message.content.trim().split(/\s+/);
    if (command === '!add-auto-reply') {
      if (!this.access.canUseAdminTools(member, message.author.id)) return false;
      const joined = args.join(' ');
      const splitAt = joined.indexOf('|');
      if (splitAt < 1) { await message.reply('Kullanım: !add-auto-reply tetikleyici | cevap'); return true; }
      const trigger = joined.slice(0, splitAt).trim();
      const response = joined.slice(splitAt + 1).trim();
      this.store.addAutoReply(message.guild!.id, trigger, response);
      await message.reply('Otomatik cevap eklendi.');
      return true;
    }
    if (command === '!remove-auto-reply') {
      if (!this.access.canUseAdminTools(member, message.author.id)) return false;
      const id = Number(args[0]);
      if (!Number.isInteger(id)) { await message.reply('Geçerli bir kayıt ID girin.'); return true; }
      this.store.deleteAutoReply(id);
      await message.reply('Otomatik cevap silindi.');
      return true;
    }
    if (command === '!cy') {
      if (!this.access.canUseAdminTools(member, message.author.id)) return false;
      const proxyText = args.join(' ').trim();
      if (!proxyText) {
        await message.reply(`CaYa yönetim bilgisi: ${message.guild!.name} | ${message.guild!.memberCount} üye | ${this.music.getBitrate(message.guild!.id)} kbps`);
        return true;
      }

      const replyMatch = proxyText.match(/^(\d{15,22})\s+([\s\S]+)$/);
      if (replyMatch) {
        if (!this.access.isOwner(message.author.id)) {
          await message.reply('Mesaj ID ile bot adına yanıt gönderme özelliğini yalnız owner kullanabilir.');
          return true;
        }
        if (!('messages' in message.channel)) throw new Error('Bu kanalda mesaj ID ile yanıt desteklenmiyor.');
        const target = await message.channel.messages.fetch(replyMatch[1]);
        await message.delete().catch(() => undefined);
        await target.reply({ content: replyMatch[2], allowedMentions: { parse: ['users', 'roles'], repliedUser: false } });
        return true;
      }

      await message.delete().catch(() => undefined);
      if (!('send' in message.channel) || typeof message.channel.send !== 'function') throw new Error('Bu kanalda bot adına mesaj gönderilemiyor.');
      await message.channel.send({ content: proxyText, allowedMentions: { parse: ['users', 'roles'] } });
      return true;
    }
    if (command === '!action' && args[0] === 'addrole') {
      if (!this.access.canUseAdminTools(member, message.author.id)) return false;
      const target = message.mentions.members?.first();
      const role = message.mentions.roles.first();
      if (!target || !role) { await message.reply('Kullanım: !action addrole @kullanıcı @rol'); return true; }
      const token = Math.random().toString(36).slice(2, 10);
      this.pendingRoleActions.set(token, { guildId: message.guild!.id, requesterId: message.author.id, targetId: target.id, roleId: role.id, expiresAt: Date.now() + 30000 });
      setTimeout(() => this.pendingRoleActions.delete(token), 30000);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`action_confirm:${token}`).setLabel('Onayla').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`action_cancel:${token}`).setLabel('İptal').setStyle(ButtonStyle.Secondary)
      );
      await message.reply({ content: `${target.user.tag} kullanıcısına ${role.name} rolü verilsin mi?`, components: [row] });
      return true;
    }
    return false;
  }

  private async handleRoleActionButton(interaction: ButtonInteraction): Promise<void> {
    const [action, token] = interaction.customId.split(':', 2);
    const pending = this.pendingRoleActions.get(token);
    if (!pending || pending.expiresAt < Date.now()) {
      this.pendingRoleActions.delete(token);
      await interaction.reply({ content: 'Bu işlem isteğinin süresi dolmuş.', ephemeral: true });
      return;
    }
    if (interaction.user.id !== pending.requesterId) {
      await interaction.reply({ content: 'Bu işlemi yalnızca isteği oluşturan kullanıcı onaylayabilir.', ephemeral: true });
      return;
    }
    this.pendingRoleActions.delete(token);
    if (action === 'action_cancel') {
      await interaction.reply({ content: 'Eylem iptal edildi.', ephemeral: true });
      return;
    }
    if (!interaction.guild || interaction.guild.id !== pending.guildId) {
      await interaction.reply({ content: 'Sunucu eşleşmesi doğrulanamadı.', ephemeral: true });
      return;
    }
    const target = await interaction.guild.members.fetch(pending.targetId);
    const role = await interaction.guild.roles.fetch(pending.roleId);
    if (!role) throw new Error('Rol artık mevcut değil.');
    await target.roles.add(role, 'CaYa confirmed role action');
    await interaction.reply({ content: `${target.user.tag} kullanıcısına ${role.name} rolü eklendi.`, ephemeral: true });
  }
}

function buildMusicControlsRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('music_pause').setLabel('Pause').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('music_resume').setLabel('Resume').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('music_skip').setLabel('Skip').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('music_stop').setLabel('Stop').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('music_queue').setLabel('Queue').setStyle(ButtonStyle.Secondary)
  );
}

function isAllowedUrl(raw: string): boolean {
  try {
    const host = new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
    return host === 'tenor.com' || host.endsWith('.tenor.com');
  } catch {
    return false;
  }
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.floor(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}s ${minutes}d`;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
