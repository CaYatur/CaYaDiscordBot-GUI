import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import type { DataStore } from './data-store.js';

export interface ResolvedMedia {
  title: string;
  webpageUrl: string;
  streamUrl: string;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class MusicRuntime {
  private readonly metadataCache = new Map<string, CacheEntry<{ title: string; webpageUrl: string }>>();
  private readonly streamCache = new Map<string, CacheEntry<string>>();
  private ytDlpPromise: Promise<string> | null = null;

  constructor(private readonly store: DataStore, private readonly onLog?: (level: 'info' | 'warn' | 'error', message: string) => void) {}

  async resolve(query: string): Promise<ResolvedMedia> {
    const target = /^https?:\/\//i.test(query) ? query : `ytsearch1:${query}`;
    const metadata = await this.resolveMetadata(target);
    const streamUrl = await this.resolveStream(metadata.webpageUrl);
    return { ...metadata, streamUrl };
  }

  async getStream(webpageUrl: string): Promise<string> {
    return this.resolveStream(webpageUrl);
  }

  async refreshStream(webpageUrl: string): Promise<string> {
    this.streamCache.delete(webpageUrl);
    return this.resolveStream(webpageUrl);
  }

  async ensureYtDlp(): Promise<string> {
    const configured = this.store.getSetting('yt_dlp_path')?.trim();
    if (configured && configured !== 'yt-dlp') return configured;
    if (this.ytDlpPromise) return this.ytDlpPromise;
    this.ytDlpPromise = this.ensureManagedYtDlp();
    try {
      return await this.ytDlpPromise;
    } finally {
      this.ytDlpPromise = null;
    }
  }

  private async ensureManagedYtDlp(): Promise<string> {
    const dataDirectory = this.store.getDataDirectory() ?? this.store.getDefaultDataDirectory();
    const toolsDirectory = path.join(dataDirectory, 'runtime-tools');
    mkdirSync(toolsDirectory, { recursive: true });
    const executablePath = path.join(toolsDirectory, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
    if (existsSync(executablePath)) {
      try {
        await execCapture(executablePath, ['--version'], 15000);
        return executablePath;
      } catch {
        rmSync(executablePath, { force: true });
        this.onLog?.('warn', 'Mevcut yönetilen yt-dlp doğrulanamadı; yeniden indirilecek.');
      }
    }

    const downloadUrl = process.platform === 'win32'
      ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
      : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
    const temporaryPath = `${executablePath}.download`;
    rmSync(temporaryPath, { force: true });
    this.onLog?.('info', 'yt-dlp bulunamadı; yönetilen runtime indiriliyor.');
    const response = await fetch(downloadUrl, {
      redirect: 'follow',
      headers: { 'user-agent': 'CaYaBot/1.0' },
      signal: AbortSignal.timeout(120000)
    });
    if (!response.ok || !response.body) throw new Error(`yt-dlp download returned HTTP ${response.status}.`);
    await pipeline(Readable.fromWeb(response.body as never), createWriteStream(temporaryPath));
    renameSync(temporaryPath, executablePath);
    if (process.platform !== 'win32') {
      const { chmodSync } = await import('node:fs');
      chmodSync(executablePath, 0o755);
    }
    try {
      const version = (await execCapture(executablePath, ['--version'], 15000)).trim();
      if (!version) throw new Error('yt-dlp sürüm bilgisi boş döndü.');
      this.onLog?.('info', `Managed yt-dlp hazır (${version}): ${executablePath}`);
      return executablePath;
    } catch (error) {
      rmSync(executablePath, { force: true });
      throw new Error(`İndirilen yt-dlp çalıştırılamadı: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async resolveMetadata(target: string): Promise<{ title: string; webpageUrl: string }> {
    const cached = this.metadataCache.get(target);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const ytDlp = await this.ensureYtDlp();
    const stdout = await execCapture(ytDlp, ['--no-playlist', '--no-warnings', '--print', '%(title)s', '--print', '%(webpage_url)s', target], 45000);
    const lines = stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines.length < 2) throw new Error('yt-dlp medya bilgisi döndürmedi.');
    const value = { title: lines[0], webpageUrl: lines[1] };
    this.metadataCache.set(target, { value, expiresAt: Date.now() + 10 * 60_000 });
    this.metadataCache.set(value.webpageUrl, { value, expiresAt: Date.now() + 10 * 60_000 });
    return value;
  }

  private async resolveStream(webpageUrl: string): Promise<string> {
    const cached = this.streamCache.get(webpageUrl);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const ytDlp = await this.ensureYtDlp();
    const stdout = await execCapture(ytDlp, ['--no-playlist', '--no-warnings', '-f', 'bestaudio/best', '-g', webpageUrl], 45000);
    const streamUrl = stdout.split(/\r?\n/).map(line => line.trim()).find(Boolean);
    if (!streamUrl) throw new Error('yt-dlp ses akışı URL’si döndürmedi.');
    this.streamCache.set(webpageUrl, { value: streamUrl, expiresAt: Date.now() + 5 * 60_000 });
    return streamUrl;
  }
}

function execCapture(executable: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${path.basename(executable)} zaman aşımına uğradı.`));
    }, timeoutMs);
    child.stdout.on('data', chunk => { stdout += String(chunk); });
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`${path.basename(executable)} ${code} koduyla kapandı: ${stderr.trim().slice(0, 500)}`));
    });
  });
}
