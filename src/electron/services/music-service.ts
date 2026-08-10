import { existsSync } from 'node:fs';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import prism from 'prism-media';
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  createAudioPlayer,
  createAudioResource,
  getVoiceConnection,
  joinVoiceChannel,
  type AudioPlayer,
  type VoiceConnection
} from '@discordjs/voice';
import type { GuildMember, VoiceBasedChannel } from 'discord.js';
import { DataStore } from './data-store.js';
import { MusicRuntime } from './music-runtime.js';

interface Track {
  title: string;
  webpageUrl: string;
  streamUrl: string;
  requestedBy: string;
}

interface GuildMusicState {
  queue: Track[];
  player: AudioPlayer;
  connection: VoiceConnection;
  current: Track | null;
  paused: boolean;
  startedAtMs: number;
  seekSeconds: number;
  restarting: boolean;
  ffmpeg: ChildProcessWithoutNullStreams | null;
  encoder: prism.opus.Encoder | null;
}

const ALLOWED_BITRATES = [48, 64, 96, 128, 192, 256, 320] as const;

export class MusicService {
  private readonly states = new Map<string, GuildMusicState>();
  private readonly runtime: MusicRuntime;

  constructor(
    private readonly store: DataStore,
    private readonly onLog?: (level: 'info' | 'warn' | 'error', message: string) => void
  ) {
    this.runtime = new MusicRuntime(store, onLog);
  }

  getBitrate(guildId: string): number {
    const stored = Number(this.store.getGuildSetting(guildId, 'music_bitrate') ?? '96');
    return ALLOWED_BITRATES.includes(stored as (typeof ALLOWED_BITRATES)[number]) ? stored : 96;
  }

  async setBitrate(guildId: string, value: number): Promise<number> {
    const normalized = ALLOWED_BITRATES.includes(value as (typeof ALLOWED_BITRATES)[number]) ? value : 96;
    this.store.setGuildSetting(guildId, 'music_bitrate', String(normalized));
    const state = this.states.get(guildId);
    if (state?.current) {
      const position = this.getPlaybackPosition(state);
      await this.restartCurrent(guildId, position);
      this.onLog?.('info', `Music bitrate changed to ${normalized} kbps; playback resumed at ${position.toFixed(1)}s.`);
    }
    return normalized;
  }

  getQueue(guildId: string): Array<{ title: string; url: string; requestedBy: string }> {
    const state = this.states.get(guildId);
    if (!state) return [];
    return [state.current, ...state.queue].filter(Boolean).map(track => ({ title: track!.title, url: track!.webpageUrl, requestedBy: track!.requestedBy }));
  }

  getNowPlaying(guildId: string): { title: string; url: string; requestedBy: string } | null {
    const current = this.states.get(guildId)?.current;
    return current ? { title: current.title, url: current.webpageUrl, requestedBy: current.requestedBy } : null;
  }

  join(member: GuildMember): string {
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) throw new Error('Önce bir ses kanalına katılmalısınız.');
    const connected = this.getConnectedChannelId(member.guild.id);
    if (connected && connected !== voiceChannel.id) throw new Error('Bot başka bir ses kanalında. Önce botun bulunduğu kanala katılın.');
    this.ensureState(voiceChannel);
    return voiceChannel.name;
  }

  canControl(member: GuildMember): boolean {
    const connectedChannelId = this.getConnectedChannelId(member.guild.id);
    return Boolean(connectedChannelId && member.voice.channelId === connectedChannelId);
  }

  assertCanControl(member: GuildMember): void {
    const connectedChannelId = this.getConnectedChannelId(member.guild.id);
    if (!connectedChannelId) throw new Error('Bot şu anda bir ses kanalında değil.');
    if (member.voice.channelId !== connectedChannelId) throw new Error('Müzik kontrolleri için botla aynı ses kanalında olmalısınız.');
  }

  async play(member: GuildMember, query: string, requestedBy: string): Promise<{ title: string; queued: boolean }> {
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) throw new Error('Önce bir ses kanalına katılmalısınız.');
    const connected = this.getConnectedChannelId(member.guild.id);
    if (connected && connected !== voiceChannel.id) throw new Error('Müzik eklemek için botla aynı ses kanalında olmalısınız.');

    const resolved = await this.runtime.resolve(query.trim());
    const track: Track = { ...resolved, requestedBy };
    const state = this.ensureState(voiceChannel);
    const queued = Boolean(state.current);
    state.queue.push(track);
    if (!state.current) await this.playNext(member.guild.id);
    return { title: track.title, queued };
  }

  pause(guildId: string): boolean {
    const state = this.states.get(guildId);
    if (!state?.current) return false;
    const changed = state.player.pause();
    if (changed) {
      state.seekSeconds = this.getPlaybackPosition(state);
      state.startedAtMs = 0;
      state.paused = true;
    }
    return changed;
  }

  resume(guildId: string): boolean {
    const state = this.states.get(guildId);
    if (!state?.current) return false;
    const changed = state.player.unpause();
    if (changed) {
      state.startedAtMs = Date.now();
      state.paused = false;
    }
    return changed;
  }

  skip(guildId: string): boolean {
    const state = this.states.get(guildId);
    if (!state?.current) return false;
    return state.player.stop(true);
  }

  stop(guildId: string): boolean {
    const state = this.states.get(guildId);
    if (!state) return false;
    state.queue.length = 0;
    state.current = null;
    state.restarting = true;
    this.cleanupPipeline(state);
    state.player.stop(true);
    try { state.connection.destroy(); } catch { /* already destroyed */ }
    this.states.delete(guildId);
    return true;
  }

  stopAll(): void {
    for (const guildId of [...this.states.keys()]) this.stop(guildId);
  }

  getConnectedChannelId(guildId: string): string | null {
    const state = this.states.get(guildId);
    return state?.connection.joinConfig.channelId ?? null;
  }

  private ensureState(channel: VoiceBasedChannel): GuildMusicState {
    const existing = this.states.get(channel.guild.id);
    if (existing) return existing;

    const connection = getVoiceConnection(channel.guild.id) ?? joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true
    });
    const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
    connection.subscribe(player);

    const state: GuildMusicState = {
      queue: [], player, connection, current: null, paused: false,
      startedAtMs: 0, seekSeconds: 0, restarting: false, ffmpeg: null, encoder: null
    };
    this.states.set(channel.guild.id, state);

    player.on(AudioPlayerStatus.Idle, () => {
      if (state.restarting) return;
      this.cleanupPipeline(state);
      state.current = null;
      state.paused = false;
      state.startedAtMs = 0;
      state.seekSeconds = 0;
      void this.playNext(channel.guild.id);
    });
    player.on('error', error => {
      if (state.restarting) return;
      this.onLog?.('error', `Music player error in ${channel.guild.name}: ${error.message}`);
      this.cleanupPipeline(state);
      state.current = null;
      state.paused = false;
      state.startedAtMs = 0;
      state.seekSeconds = 0;
      void this.playNext(channel.guild.id);
    });
    return state;
  }

  private async playNext(guildId: string): Promise<void> {
    const state = this.states.get(guildId);
    if (!state || state.current) return;
    const next = state.queue.shift();
    if (!next) return;
    state.current = next;
    state.seekSeconds = 0;
    await this.playCurrentAt(guildId, 0);
  }

  private async restartCurrent(guildId: string, seekSeconds: number): Promise<void> {
    const state = this.states.get(guildId);
    if (!state?.current) return;
    state.restarting = true;
    this.cleanupPipeline(state);
    state.player.stop(true);
    state.seekSeconds = Math.max(0, seekSeconds);
    try {
      await this.playCurrentAt(guildId, state.seekSeconds);
    } finally {
      state.restarting = false;
    }
  }

  private async playCurrentAt(guildId: string, seekSeconds: number): Promise<void> {
    const state = this.states.get(guildId);
    if (!state?.current) return;
    const ffmpegPath = resolveFfmpegPath();
    if (!ffmpegPath) throw new Error('FFmpeg runtime bulunamadı. Uygulamayı yeniden kurmayı deneyin.');

    state.current.streamUrl = await this.runtime.getStream(state.current.webpageUrl);
    const bitrate = this.getBitrate(guildId);
    const args = [
      '-hide_banner', '-loglevel', 'error',
      ...(seekSeconds > 0 ? ['-ss', seekSeconds.toFixed(3)] : []),
      '-i', state.current.streamUrl,
      '-vn', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1'
    ];
    const ffmpeg = spawn(ffmpegPath, args, { windowsHide: true });
    const encoder = new prism.opus.Encoder({ rate: 48000, channels: 2, frameSize: 960 });
    encoder.setBitrate(bitrate * 1000);
    state.ffmpeg = ffmpeg;
    state.encoder = encoder;
    ffmpeg.stdout.pipe(encoder);
    ffmpeg.stderr.on('data', chunk => {
      const line = String(chunk).trim();
      if (line) this.onLog?.('warn', `FFmpeg: ${line.slice(0, 400)}`);
    });
    ffmpeg.on('error', error => this.onLog?.('error', `FFmpeg başlatılamadı: ${error.message}`));

    const resource = createAudioResource(encoder, { inputType: StreamType.Opus });
    state.player.play(resource);
    state.paused = false;
    state.seekSeconds = Math.max(0, seekSeconds);
    state.startedAtMs = Date.now();
  }

  private getPlaybackPosition(state: GuildMusicState): number {
    if (!state.current) return 0;
    if (state.paused || !state.startedAtMs) return state.seekSeconds;
    return state.seekSeconds + Math.max(0, Date.now() - state.startedAtMs) / 1000;
  }

  private cleanupPipeline(state: GuildMusicState): void {
    try { state.ffmpeg?.stdout.unpipe(); } catch { /* no-op */ }
    try { state.encoder?.destroy(); } catch { /* no-op */ }
    try { state.ffmpeg?.kill(); } catch { /* no-op */ }
    state.ffmpeg = null;
    state.encoder = null;
  }
}

function resolveFfmpegPath(): string | null {
  if (!ffmpegStatic) return null;
  if (/app\.asar[\\/]/i.test(ffmpegStatic)) {
    const unpacked = ffmpegStatic.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
    if (existsSync(unpacked)) return unpacked;
  }
  return existsSync(ffmpegStatic) ? ffmpegStatic : null;
}
