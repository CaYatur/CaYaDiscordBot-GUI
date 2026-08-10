import { AttachmentBuilder, type Client, type Message, type TextBasedChannel } from 'discord.js';
import sharp from 'sharp';
import { AI_PROMPT_DEFAULTS, AI_PROMPT_SETTING_KEYS, applyPromptTemplate, type AiPromptKey } from '../../shared/ai-prompts.js';
import type { AiConnectionTestResult, AiModelCatalogResult, AiModelListResult } from '../../shared/contracts.js';
import { DataStore } from './data-store.js';

interface ChatTurn { role: 'user' | 'assistant'; content: string }
interface WebSearchCandidate { title: string; target: string; snippet: string }
interface VisualSource { url: string; animated: boolean; label: string }

export class AiService {
  private readonly history = new Map<string, ChatTurn[]>();
  private readonly lastResearch = new Map<string, { sources: string; usedAt: number }>();

  constructor(
    private readonly store: DataStore,
    private readonly onLog?: (level: 'info' | 'warn' | 'error', message: string) => void
  ) {}

  async handleMessage(client: Client, message: Message): Promise<boolean> {
    if (message.author.bot || !message.guild || !client.user) return false;
    const config = this.getConfig();
    if (!config.enabled) return false;

    const mentioned = message.mentions.has(client.user);
    let repliedToBot = false;
    let referencedMessage: Message | null = null;
    if (message.reference?.messageId) {
      try {
        referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
        repliedToBot = referencedMessage.author.id === client.user.id;
      } catch {
        repliedToBot = false;
        referencedMessage = null;
      }
    }

    const content = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
    const visualSources = collectVisualSources(message, referencedMessage);
    const visualAnalysisRequested = visualSources.length > 0 && (mentioned || repliedToBot || isVisualAnalysisRequest(content));
    if (!mentioned && !repliedToBot && !visualAnalysisRequested) return false;
    if (!content && visualSources.length === 0) return true;
    if ('sendTyping' in message.channel && typeof message.channel.sendTyping === 'function') {
      await message.channel.sendTyping().catch(() => undefined);
    }

    const key = `${message.guild.id}:${message.channel.id}:${message.author.id}`;
    const turns = this.history.get(key) ?? [];

    try {
      if (visualAnalysisRequested) {
        const question = content || 'Bu görselde ne var?';
        const response = await this.analyzeVisualSource(visualSources[0], question);
        await sendChunked(message.channel, response);
        return true;
      }

      if (isImageRequest(content)) {
        if (!config.imageEnabled) {
          await message.reply('Görsel oluşturma kapalı. Yapay Zeka ayarlarından Görsel Oluşturma özelliğini açabilirsiniz.');
          return true;
        }

        const subject = extractImageSubject(content);
        if (!subject) {
          await message.reply('Ne çizmemi istediğinizi belirtin. Örnek: `deniz görseli oluştur`.');
          return true;
        }

        const image = await this.generateImage(subject);
        if (!image.buffer.length) throw new Error('ComfyUI returned an empty image.');
        await message.reply({ content: `Görsel oluşturuldu: **${subject}**`, files: [new AttachmentBuilder(image.buffer, { name: image.filename })] });
        return true;
      }

      if (!config.llmEnabled) {
        await message.reply('AI chat is disabled / AI sohbeti kapalı.');
        return true;
      }

      let research = '';
      const researchRequested = shouldSearch(content);
      const followUpRequested = !researchRequested && isResearchFollowUp(content);
      const recentResearch = this.lastResearch.get(key);
      const canReuseResearch = followUpRequested && recentResearch && Date.now() - recentResearch.usedAt < 10 * 60_000;

      if (researchRequested) this.lastResearch.delete(key);
      else if (!followUpRequested) this.lastResearch.delete(key);

      if (researchRequested && !config.webSearch) {
        await message.reply('Web research is disabled / Web araştırması kapalı.');
        return true;
      }
      if (researchRequested) {
        const query = normalizeResearchQuery(content);
        research = await this.searchWeb(query).catch(error => {
          this.onLog?.('error', `Web research failed: ${error instanceof Error ? error.message : String(error)}`);
          return '';
        });
        if (!research) {
          this.onLog?.('warn', `Web research returned no usable sources for: ${query}`);
          await message.reply('Bu bilgiyi web kaynaklarından doğrulayamadım. Tahmin etmek yerine burada duruyorum.');
          return true;
        }
        this.lastResearch.set(key, { sources: research, usedAt: Date.now() });
      } else if (canReuseResearch && recentResearch) {
        research = recentResearch.sources;
      }

      turns.push({ role: 'user', content });
      while (turns.length > 6) turns.shift();

      const rawResponse = await this.askOllama(turns, research);
      const response = research ? ensureResearchCitation(rawResponse, research) : rawResponse;
      turns.push({ role: 'assistant', content: response });
      this.history.set(key, turns);
      await sendChunked(message.channel, response);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      this.onLog?.('error', `AI request failed: ${text}`);
      await message.reply(`AI error: ${text}`.slice(0, 1900));
    }
    return true;
  }

  async raffle(channel: TextBasedChannel, names: string[]): Promise<string> {
    const clean = names.map(name => name.trim()).filter(Boolean);
    if (clean.length < 2) throw new Error('At least two entries are required.');
    const winner = clean[Math.floor(Math.random() * clean.length)];
    if (!('send' in channel) || typeof channel.send !== 'function') throw new Error('This channel cannot send messages.');
    await channel.send(`Kura sonucu: **${winner}**`);
    return winner;
  }

  getConfig() {
    const legacyModel = this.store.getSetting('ollama_model')?.trim() ?? '';
    const chatModel = this.store.getSetting('ollama_chat_model')?.trim() || legacyModel;
    return {
      enabled: this.store.getSetting('ai_enabled') === 'true',
      llmEnabled: this.store.getSetting('ai_llm_enabled') !== 'false',
      ollamaUrl: this.store.getSetting('ollama_url') ?? 'http://127.0.0.1:11434',
      chatModel,
      webModel: this.store.getSetting('ollama_web_model')?.trim() || chatModel,
      imagePromptModel: this.store.getSetting('ollama_image_prompt_model')?.trim() || chatModel,
      visionModel: this.store.getSetting('ollama_vision_model')?.trim() || '',
      webSearch: this.store.getSetting('ai_web_search') !== 'false',
      comfyUrl: this.store.getSetting('comfyui_url') ?? 'http://127.0.0.1:8000',
      imageModel: this.store.getSetting('comfyui_model') ?? 'flux1-schnell-fp8.safetensors',
      imageEnabled: this.store.getSetting('ai_image_enabled') === 'true'
    };
  }

  async testOllamaConnection(url: string): Promise<AiConnectionTestResult> {
    try {
      const response = await fetch(`${normalizeBaseUrl(url)}/api/tags`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) return { ok: false, message: `HTTP ${response.status}` };
      const body = await response.json() as { models?: unknown[] };
      return { ok: true, message: `${body.models?.length ?? 0} model(s) available` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async testComfyConnection(url: string): Promise<AiConnectionTestResult> {
    try {
      const response = await fetch(`${normalizeBaseUrl(url)}/system_stats`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) return { ok: false, message: `HTTP ${response.status}` };
      return { ok: true, message: 'ComfyUI is reachable' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async getOllamaModels(url: string): Promise<AiModelListResult> {
    try {
      const response = await fetch(`${normalizeBaseUrl(url)}/api/tags`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) return { ok: false, message: `HTTP ${response.status}`, models: [] };
      const body = await response.json() as { models?: Array<{ name?: string; model?: string }> };
      const models = (body.models ?? [])
        .map(item => (item.model || item.name || '').trim())
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index)
        .sort((a, b) => a.localeCompare(b));
      return { ok: true, message: `${models.length} model(s) available`, models };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error), models: [] };
    }
  }

  async getOllamaModelCatalog(url: string): Promise<AiModelCatalogResult> {
    try {
      const base = normalizeBaseUrl(url);
      const listed = await this.getOllamaModels(base);
      if (!listed.ok) return { ok: false, message: listed.message, models: [] };
      const models = await Promise.all(listed.models.map(async name => {
        try {
          const response = await fetch(`${base}/api/show`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ model: name }),
            signal: AbortSignal.timeout(8000)
          });
          if (!response.ok) return { name, capabilities: [] };
          const body = await response.json() as { capabilities?: unknown[] };
          return { name, capabilities: (body.capabilities ?? []).filter((item): item is string => typeof item === 'string') };
        } catch {
          return { name, capabilities: [] };
        }
      }));
      return { ok: true, message: `${models.length} model(s) inspected`, models };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error), models: [] };
    }
  }

  async getComfyCheckpoints(url: string): Promise<AiModelListResult> {
    try {
      const base = normalizeBaseUrl(url);
      const endpoints = [
        `${base}/object_info/CheckpointLoaderSimple`,
        `${base}/api/object_info/CheckpointLoaderSimple`,
        `${base}/object_info`
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
          if (!response.ok) continue;
          const body = await response.json() as unknown;
          const models = extractComfyCheckpointNames(body);
          if (models.length > 0) {
            return { ok: true, message: `${models.length} checkpoint(s) available`, models };
          }
        } catch {
          // Try the next compatible endpoint shape.
        }
      }

      return { ok: false, message: 'No checkpoints were returned by ComfyUI.', models: [] };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error), models: [] };
    }
  }

  private getPrompt(key: AiPromptKey): string {
    return this.store.getSetting(AI_PROMPT_SETTING_KEYS[key]) ?? AI_PROMPT_DEFAULTS[key];
  }

  private async askOllama(turns: ChatTurn[], research: string): Promise<string> {
    const config = this.getConfig();
    const selectedModel = research ? config.webModel : config.chatModel;
    if (!selectedModel) throw new Error('Select an Ollama response model in AI settings.');
    const promptValues = { model: selectedModel, research };
    const verifiedFact = research ? extractVerifiedResearchFact(turns, research) : '';
    const system = [
      applyPromptTemplate(this.getPrompt('assistantSystem'), promptValues),
      applyPromptTemplate(this.getPrompt('assistantBehavior'), promptValues),
      research ? applyPromptTemplate(this.getPrompt('webResearchContext'), promptValues) : '',
      verifiedFact ? `HIGH-CONFIDENCE VERIFIED FACT FROM SOURCE [1]: ${verifiedFact}\nWhen the user asks for this date, use this verified date and do not replace it with publication dates, later updates, reopening claims, or unsupported memory.` : ''
    ].filter(Boolean).join('\n\n');

    const response = await fetch(`${config.ollamaUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: selectedModel, stream: false, messages: [{ role: 'system', content: system }, ...turns] }),
      signal: AbortSignal.timeout(120000)
    });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}.`);
    const json = await response.json() as { message?: { content?: string } };
    const content = json.message?.content?.trim();
    if (!content) throw new Error('Ollama returned an empty response.');
    return content;
  }

  private async analyzeVisualSource(source: VisualSource, question: string): Promise<string> {
    const config = this.getConfig();
    if (!config.visionModel) throw new Error('Select a vision-capable Ollama model in AI settings.');

    const showResponse = await fetch(`${config.ollamaUrl.replace(/\/$/, '')}/api/show`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: config.visionModel }),
      signal: AbortSignal.timeout(8000)
    });
    if (!showResponse.ok) throw new Error(`Ollama model check returned HTTP ${showResponse.status}.`);
    const show = await showResponse.json() as { capabilities?: unknown[] };
    const capabilities = (show.capabilities ?? []).filter((item): item is string => typeof item === 'string');
    if (!capabilities.includes('vision')) {
      throw new Error(`Selected model ${config.visionModel} does not support vision.`);
    }

    const imageResponse = await fetch(source.url, { signal: AbortSignal.timeout(20000) });
    if (!imageResponse.ok) throw new Error(`Image download returned HTTP ${imageResponse.status}.`);
    const contentLength = Number(imageResponse.headers.get('content-length') ?? '0');
    if (contentLength > 20 * 1024 * 1024) throw new Error('Image is larger than the 20 MB analysis limit.');
    const raw = Buffer.from(await imageResponse.arrayBuffer());
    if (!raw.length) throw new Error('Image download returned an empty file.');
    if (raw.length > 20 * 1024 * 1024) throw new Error('Image is larger than the 20 MB analysis limit.');

    const normalizedInput = await normalizeVisualInput(raw, source.animated);
    this.onLog?.('info', `Vision analysis using ${config.visionModel}; source=${source.label}; bytes=${raw.length}; frames=${normalizedInput.frames}.`);

    const userQuestion = question.trim() || 'Bu görselde ne var?';
    const languageNote = getVisionLanguageInstruction(userQuestion);
    const gifNote = source.animated
      ? `\nThis input is an animated GIF represented by ${normalizedInput.frames} sampled frames from the animation. Compare the frames before answering and mention motion only when it is visible across them.`
      : '';
    const response = await fetch(`${config.ollamaUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: config.visionModel,
        stream: false,
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: this.getPrompt('visionAnalysis') },
          { role: 'user', content: `${userQuestion}${gifNote}\n${languageNote}`, images: [normalizedInput.buffer.toString('base64')] }
        ]
      }),
      signal: AbortSignal.timeout(180000)
    });
    if (!response.ok) throw new Error(`Ollama vision request returned HTTP ${response.status}.`);
    const json = await response.json() as { message?: { content?: string } };
    const content = json.message?.content?.trim();
    if (!content) throw new Error('Ollama vision model returned an empty response.');
    return content;
  }

  private async rewriteImagePrompt(subject: string): Promise<string> {
    const config = this.getConfig();
    if (!config.imagePromptModel) throw new Error('Select an Ollama image-prompt model before using image generation.');

    try {
      const response = await fetch(`${config.ollamaUrl.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: config.imagePromptModel,
          stream: false,
          keep_alive: 0,
          options: { temperature: 0 },
          messages: [
            { role: 'system', content: this.getPrompt('imagePromptRewrite') },
            { role: 'user', content: subject }
          ]
        }),
        signal: AbortSignal.timeout(60000)
      });
      if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}.`);
      const json = await response.json() as { message?: { content?: string } };
      const rewritten = sanitizeImagePrompt(json.message?.content ?? '');
      if (!rewritten) throw new Error('Ollama returned an empty image prompt.');
      this.onLog?.('info', `Image prompt normalized for ComfyUI: ${rewritten.slice(0, 220)}`);
      return rewritten;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.onLog?.('error', `Image prompt rewrite failed: ${message}`);
      throw new Error(`Image prompt translation failed: ${message}`);
    }
  }

  private async generateImage(prompt: string): Promise<{ filename: string; buffer: Buffer }> {
    const config = this.getConfig();
    const base = config.comfyUrl.replace(/\/$/, '');
    const rewrittenPrompt = await this.rewriteImagePrompt(prompt);
    const positivePrompt = applyPromptTemplate(this.getPrompt('imagePromptTemplate'), { prompt: rewrittenPrompt });
    const negativePrompt = config.imageModel.toLocaleLowerCase('en').includes('schnell') ? '' : this.getPrompt('imageNegativePrompt');
    const workflow = {
      '6': { inputs: { text: positivePrompt, clip: ['30', 1] }, class_type: 'CLIPTextEncode' },
      '8': { inputs: { samples: ['31', 0], vae: ['30', 2] }, class_type: 'VAEDecode' },
      '9': { inputs: { filename_prefix: 'CaYaBot_', images: ['8', 0] }, class_type: 'SaveImage' },
      '27': { inputs: { width: 1024, height: 1024, batch_size: 1 }, class_type: 'EmptySD3LatentImage' },
      '30': { inputs: { ckpt_name: config.imageModel }, class_type: 'CheckpointLoaderSimple' },
      '31': { inputs: { seed: Math.floor(Math.random() * 1_000_000_000), steps: 4, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1, model: ['30', 0], positive: ['6', 0], negative: ['33', 0], latent_image: ['27', 0] }, class_type: 'KSampler' },
      '33': { inputs: { text: negativePrompt, clip: ['30', 1] }, class_type: 'CLIPTextEncode' }
    };
    const queued = await fetch(`${base}/prompt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: 'cayabot-discord' }),
      signal: AbortSignal.timeout(60000)
    });
    if (!queued.ok) throw new Error(`ComfyUI returned HTTP ${queued.status}.`);
    const queuedJson = await queued.json() as { prompt_id?: string };
    if (!queuedJson.prompt_id) throw new Error('ComfyUI did not return a prompt ID.');

    const started = Date.now();
    while (Date.now() - started < 120000) {
      await sleep(2000);
      const historyResponse = await fetch(`${base}/history/${encodeURIComponent(queuedJson.prompt_id)}`, { signal: AbortSignal.timeout(10000) });
      if (!historyResponse.ok) continue;
      const history = await historyResponse.json() as Record<string, { outputs?: Record<string, { images?: Array<{ filename: string; subfolder?: string; type?: string }> }> }>;
      const outputs = history[queuedJson.prompt_id]?.outputs;
      if (!outputs) continue;
      for (const node of Object.values(outputs)) {
        const image = node.images?.[0];
        if (!image?.filename) continue;
        const params = new URLSearchParams({ filename: image.filename, subfolder: image.subfolder ?? '', type: image.type ?? 'output' });
        const imageResponse = await fetch(`${base}/view?${params.toString()}`, { signal: AbortSignal.timeout(20000) });
        if (!imageResponse.ok) throw new Error(`ComfyUI image download returned HTTP ${imageResponse.status}.`);
        return { filename: image.filename, buffer: Buffer.from(await imageResponse.arrayBuffer()) };
      }
    }
    throw new Error('ComfyUI image generation timed out.');
  }

  private async searchWeb(query: string): Promise<string> {
    const directUrl = extractDirectWebUrl(query);
    if (directUrl) {
      const directSource = await fetchWebSource(directUrl, 1).catch(() => '');
      if (directSource) return directSource;
    }

    const searchQueries = buildSearchQueries(query);
    const eventResearch = isEventResearchQuery(query);
    const verificationResearch = isVerificationResearchQuery(query);
    const verificationGroup = verificationResearch
      ? await searchWikipedia(query).catch(error => {
          this.onLog?.('warn', `Wikipedia verification failed: ${error instanceof Error ? error.message : String(error)}`);
          return [];
        })
      : [];

    const groups: WebSearchCandidate[][] = [];
    let duckDuckGoAvailable = true;
    for (const searchQuery of searchQueries) {
      let provider = 'DuckDuckGo';
      let group: WebSearchCandidate[] = [];
      if (duckDuckGoAvailable) {
        try {
          group = await searchDuckDuckGo(searchQuery);
          if (!group.length) duckDuckGoAvailable = false;
        } catch (error) {
          duckDuckGoAvailable = false;
          this.onLog?.('warn', `DuckDuckGo query failed (${searchQuery}): ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      if (!group.length && eventResearch) {
        provider = 'Bing News';
        group = await searchBingRss(searchQuery, true).catch(error => {
          this.onLog?.('warn', `Bing News query failed (${searchQuery}): ${error instanceof Error ? error.message : String(error)}`);
          return [];
        });
      }

      if (!group.length) {
        provider = 'Bing Web';
        group = await searchBingRss(searchQuery, false).catch(error => {
          this.onLog?.('warn', `Bing Web query failed (${searchQuery}): ${error instanceof Error ? error.message : String(error)}`);
          return [];
        });
      }

      if (group.length) {
        groups.push(group);
        if (provider !== 'DuckDuckGo') this.onLog?.('info', `Web research fallback used: ${provider}.`);
      }
      await sleep(250);
    }

    const candidates: WebSearchCandidate[] = [];
    const seenTargets = new Set<string>();
    for (const candidate of verificationGroup.slice(0, 2)) {
      if (seenTargets.has(candidate.target)) continue;
      seenTargets.add(candidate.target);
      candidates.push(candidate);
    }

    for (let rank = 0; rank < 6 && candidates.length < 8; rank += 1) {
      for (const group of groups) {
        const candidate = group[rank];
        if (!candidate || seenTargets.has(candidate.target)) continue;
        seenTargets.add(candidate.target);
        candidates.push(candidate);
        if (candidates.length >= 8) break;
      }
    }

    if (!candidates.length) return '';

    const selected = candidates.slice(0, 6);
    const results = await Promise.all(selected.map(async (candidate, index) => {
      const isWikipedia = /(?:^|\.)wikipedia\.org$/i.test(new URL(candidate.target).hostname);
      if (index < 5 && !isWikipedia) {
        const fullSource = await fetchWebSource(candidate.target, index + 1).catch(() => '');
        if (fullSource) return fullSource;
      }
      return `[${index + 1}] ${candidate.title}\nURL: ${candidate.target}\nSummary: ${candidate.snippet || 'No summary was provided by the search result.'}`;
    }));

    return results.join('\n\n').slice(0, 16000);
  }
}

function buildSearchQueries(query: string): string[] {
  const clean = query.replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const lower = clean.toLocaleLowerCase('tr');
  const looksTurkish = /[çğıöşü]/i.test(clean) || /\b(ne|nedir|kim|neden|nasıl|tarih|erişim|engel|karar|yasak|yasaklandı|araştır)\b/i.test(lower);
  const historicalOrDecision = /\b(ne zaman|tarih|ilk|karar|mahkeme|erişim engeli|engellendi|yasak|yasaklandı|kapatıldı|when|date|decision|blocked|banned|ban)\b/i.test(lower);
  const currentTopic = /\b(güncel|son durum|bugün|current|latest|today|news)\b/i.test(lower);

  const variants = [clean];
  if (looksTurkish) {
    if (historicalOrDecision) {
      variants.push(`${clean} ilk karar tarih resmi açıklama`);
      variants.push(`${clean} mahkeme karar tarihi`);
    } else if (currentTopic) {
      variants.push(`${clean} resmi açıklama`);
      variants.push(`${clean} son gelişmeler`);
    } else {
      variants.push(`${clean} resmi kaynak`);
      variants.push(`${clean} ayrıntılı bilgi`);
    }
  } else if (historicalOrDecision) {
    variants.push(`${clean} original decision date official source`);
    variants.push(`${clean} court decision date`);
  } else if (currentTopic) {
    variants.push(`${clean} official statement`);
    variants.push(`${clean} latest developments`);
  } else {
    variants.push(`${clean} official source`);
    variants.push(`${clean} detailed information`);
  }

  return variants.filter((value, index, values) => values.indexOf(value) === index).slice(0, 3);
}

function isEventResearchQuery(query: string): boolean {
  const lower = query.toLocaleLowerCase();
  return /(ne zaman|hangi tarihte|kaç yılında|tarih|erişim engeli|engellendi|yasaklandı|kapatıldı|karar|mahkeme|güncel|son durum|haber|when|date|blocked|banned|decision|court|latest|current|news|cuándo|fecha|wann|datum|quand|quando|data|когда|дата)/i.test(lower) ||
    /(いつ|日付|언제|날짜|什么时候|日期)/i.test(lower);
}

function isVerificationResearchQuery(query: string): boolean {
  const lower = query.toLocaleLowerCase();
  return /(ne zaman|hangi tarihte|kaç yılında|tarih|erişim engeli|engellendi|yasaklandı|kapatıldı|karar|mahkeme|when was|what date|blocked|banned|decision|court|cuándo|fecha|wann|datum|quand|quando|data|когда|дата)/i.test(lower) ||
    /(いつ|日付|언제|날짜|什么时候|日期)/i.test(lower);
}

async function searchWikipedia(query: string): Promise<WebSearchCandidate[]> {
  const lower = query.toLocaleLowerCase('tr');
  const accessBlockContext = /(türkiye|türkiyede|türkiye'de|erişim|erişime|engel|engellendi|yasak|yasaklandı|kapatıldı|blocked|banned)/i.test(lower);
  const simplified = query
    .replace(/(?:türkiyede|türkiye'de|ne zaman|hangi tarihte|kaç yılında|erişime|erişim|engellendi|engeli|yasaklandı|yasak|kapatıldı|oldu|karar|mahkeme)/gi, ' ')
    .replace(/[?.!,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const searchQuery = accessBlockContext
    ? `${simplified || query} Türkiye erişim engeli`.trim()
    : (simplified || query).trim();
  const endpoint = `https://tr.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchQuery)}&format=json&utf8=1&srlimit=5&origin=*`;
  const response = await fetch(endpoint, {
    headers: { 'user-agent': 'CaYaBot/1.0' },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Wikipedia returned HTTP ${response.status}.`);
  const body = await response.json() as { query?: { search?: Array<{ title?: string; snippet?: string }> } };
  return (body.query?.search ?? []).map(item => {
    const title = item.title?.trim() ?? '';
    const snippet = decodeHtml(stripTags(item.snippet ?? '')).trim();
    return {
      title,
      target: title ? `https://tr.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}` : '',
      snippet
    };
  }).filter(candidate => candidate.title && candidate.target).sort((a, b) => scoreVerificationCandidate(b) - scoreVerificationCandidate(a));
}

function scoreVerificationCandidate(candidate: WebSearchCandidate): number {
  const text = `${candidate.title} ${candidate.snippet}`.toLocaleLowerCase('tr');
  let score = 0;
  if (/\b\d{1,2}\s+(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)\s+20\d{2}\b/i.test(text)) score += 8;
  if (/\b20\d{2}\b/.test(text)) score += 2;
  if (text.includes('erişim engeli') || text.includes('erişime engel')) score += 5;
  if (/\b(karar|mahkeme|hakimlik|btk)\b/i.test(text)) score += 2;
  if (/20\d{2}'?te türkiye/i.test(candidate.title)) score += 4;
  return score;
}

async function searchBingRss(query: string, news: boolean): Promise<WebSearchCandidate[]> {
  const endpoint = news
    ? `https://www.bing.com/news/search?format=rss&setlang=tr&q=${encodeURIComponent(query)}`
    : `https://www.bing.com/search?format=rss&setlang=tr&q=${encodeURIComponent(query)}`;
  const response = await fetch(endpoint, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 CaYaBot/1.0',
      'accept-language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
    },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Bing returned HTTP ${response.status}.`);

  const xml = await response.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 8);
  return items.map(match => {
    const item = match[1];
    const title = decodeHtml(stripTags(item.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '')).trim();
    const rawLink = decodeHtml(stripTags(item.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? '')).trim();
    const description = decodeHtml(stripTags(item.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? '')).trim();
    return {
      title,
      target: news ? resolveBingNewsUrl(rawLink) : rawLink,
      snippet: description
    };
  }).filter(candidate => candidate.title && candidate.target);
}

function resolveBingNewsUrl(raw: string): string {
  try {
    const parsed = new URL(raw, 'https://www.bing.com');
    const target = parsed.searchParams.get('url');
    if (target && /^https?:\/\//i.test(target)) return target;
    return parsed.toString();
  } catch {
    return '';
  }
}

async function searchDuckDuckGo(query: string): Promise<WebSearchCandidate[]> {
  const headers = {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 CaYaBot/1.0',
    'accept-language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
  };

  const parseHtmlResults = (html: string): WebSearchCandidate[] => {
    const links = [...html.matchAll(/<a(?=[^>]*class=["']result__a["'])(?=[^>]*href=["']([^"']+)["'])[^>]*>([\s\S]*?)<\/a>/gi)];
    const snippets = [...html.matchAll(/<(?:a|div)(?=[^>]*class=["']result__snippet["'])[^>]*>([\s\S]*?)<\/(?:a|div)>/gi)];
    return links.slice(0, 6).map((match, index) => ({
      title: decodeHtml(stripTags(match[2])).trim(),
      target: resolveDuckDuckGoUrl(match[1]),
      snippet: snippets[index] ? decodeHtml(stripTags(snippets[index][1])).trim() : ''
    })).filter(candidate => candidate.title && candidate.target);
  };

  const parseLiteResults = (html: string): WebSearchCandidate[] => {
    const links = [...html.matchAll(/<a(?=[^>]*class=["']result-link["'])(?=[^>]*href=["']([^"']+)["'])[^>]*>([\s\S]*?)<\/a>/gi)];
    const snippets = [...html.matchAll(/<td(?=[^>]*class=["']result-snippet["'])[^>]*>([\s\S]*?)<\/td>/gi)];
    return links.slice(0, 6).map((match, index) => ({
      title: decodeHtml(stripTags(match[2])).trim(),
      target: resolveDuckDuckGoUrl(match[1]),
      snippet: snippets[index] ? decodeHtml(stripTags(snippets[index][1])).trim() : ''
    })).filter(candidate => candidate.title && candidate.target);
  };

  const encoded = encodeURIComponent(query);
  const htmlResponse = await fetch(`https://html.duckduckgo.com/html/?q=${encoded}`, {
    headers,
    signal: AbortSignal.timeout(15000)
  });
  if (htmlResponse.ok) {
    const candidates = parseHtmlResults(await htmlResponse.text());
    if (candidates.length) return candidates;
  }

  await sleep(350);
  const liteResponse = await fetch(`https://lite.duckduckgo.com/lite/?q=${encoded}`, {
    headers,
    signal: AbortSignal.timeout(15000)
  });
  if (!liteResponse.ok) throw new Error(`Search provider returned HTTP ${liteResponse.status}.`);
  return parseLiteResults(await liteResponse.text());
}

function extractComfyCheckpointNames(body: unknown): string[] {
  if (!body || typeof body !== 'object') return [];
  const root = body as Record<string, unknown>;
  const node = (root.CheckpointLoaderSimple ?? root) as Record<string, unknown>;
  const input = node.input as Record<string, unknown> | undefined;
  const required = input?.required as Record<string, unknown> | undefined;
  const ckptName = required?.ckpt_name;

  if (Array.isArray(ckptName) && Array.isArray(ckptName[0])) {
    return (ckptName[0] as unknown[])
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map(value => value.trim())
      .filter((value, index, values) => values.indexOf(value) === index)
      .sort((a, b) => a.localeCompare(b));
  }

  return [];
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Service URL is required.');
  return trimmed.replace(/\/$/, '');
}

function extractDirectWebUrl(text: string): string | null {
  const match = text.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z]{2,})+)(?:\/[^\s]*)?/i);
  if (!match) return null;
  const candidate = match[0].replace(/[),.;!?]+$/, '');
  const normalized = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost')) return null;
    if (/^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

async function fetchWebSource(url: string, index = 1): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 CaYaBot/1.0',
      'accept-language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) return '';
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html') && !contentType.includes('text/plain')) return '';

  const html = await response.text();
  const title = decodeHtml(stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')).trim();
  const description = decodeHtml((html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? '').trim());
  const body = decodeHtml(stripTags(html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 6000);
  if (!title && !description && !body) return '';

  const summaryParts = [description, body].filter(Boolean);
  const summary = summaryParts.filter((value, idx, values) => values.indexOf(value) === idx).join('\nPage content: ');
  return `[${index}] ${title || new URL(response.url).hostname}\nURL: ${response.url}\nSummary: ${summary}`;
}

function shouldSearch(text: string): boolean {
  const lower = text.toLocaleLowerCase();
  const latinSignals = /\b(today|latest|current|news|price|weather|research|search|look up|bugün|güncel|haber|fiyat|hava|ara|araştır|buscar|busca|investigar|investiga|rechercher|recherche|chercher|cherche|suchen|suche|recherchieren|recherche|cerca|cercare|ricerca|pesquisar|pesquisa|procurar|procura|szukaj|wyszukaj|zoeken|zoek)\b/i.test(lower);
  const factualTimeSignals = /\b(ne zaman|hangi tarihte|kaç yılında|ne zaman oldu|erişime engellendi|erişim engeli|yasaklandı|kapatıldı|karar tarihi|mahkeme kararı|when was|what date|blocked in|banned in|shutdown date|decision date|cuándo|fecha|wann|datum|quand|date de|quando|data|когда|дата)\b/i.test(lower);
  const definitionSignals = /\b(nedir|kimdir|ne işe yarar|ne sitesi|hangi site|site ne|what is|who is|what does .+ do|qué es|quién es|que es|quien es|was ist|wer ist|qu'est-ce que|qui est|che cos'è|chi è|o que é|quem é|что такое|кто такой|кто такая)\b/i.test(lower);
  const nonLatinSignals = /(поиск|найди|найти|исследуй|исследовать|検索|調べて|調べる|探して|검색|찾아|검색해|搜索|查找|搜一下|查询|いつ|日付|언제|날짜|什么时候|日期|とは|誰|무엇|누구|是什么|是谁)/i.test(lower);
  return Boolean(extractDirectWebUrl(text)) || latinSignals || factualTimeSignals || definitionSignals || nonLatinSignals ||
    lower.includes('web de ara') || lower.includes("web'de ara") || lower.includes('webde ara') || lower.includes('internette ara') || lower.includes('internetten araştır') || lower.includes('web araştır') || lower.includes('webde araştır') || lower.includes('son durum') ||
    lower.includes('search the web') || lower.includes('buscar en la web') || lower.includes('buscar en internet') ||
    lower.includes('im web suchen') || lower.includes('im internet suchen') || lower.includes('rechercher sur le web') ||
    lower.includes('cerca sul web') || lower.includes('pesquisar na web');
}

function isResearchFollowUp(text: string): boolean {
  const lower = text.trim().toLocaleLowerCase();
  return /^(neden|niye|sebebi ne|kaynak|kaynak\?|kaynağı ne|kaynakları ver|emin misin|doğru mu|detay|detaylandır|why|source|sources|are you sure|details|por qué|fuente|fuentes|warum|quelle|quellen|pourquoi|source|sources|perché|fonte|fonti|почему|источник|источники|なぜ|ソース|왜|출처|为什么|来源)[?.!\s]*$/i.test(lower);
}

function normalizeResearchQuery(text: string): string {
  const cleaned = text
    .replace(/\b(web\s*de|web'de|webde|internette|internetten)\s+(?:ara|araştır|araştırma|araştırması)(?:\s+yap)?\b/gi, ' ')
    .replace(/\bweb\s+(?:araştırma|araştırması)(?:\s+yap)?\b/gi, ' ')
    .replace(/\b(search(?: the)? web|look up|research|araştırması|araştırma|araştır|ara|buscar(?: en (?:la web|internet))?|investigar|rechercher(?: sur le web)?|chercher|suchen|recherchieren|cercare|cerca(?: sul web)?|pesquisar(?: na web)?|procurar|szukaj|wyszukaj|zoeken|zoek)\b/gi, ' ')
    .replace(/(поиск|найди|найти|исследуй|исследовать|検索|調べて|調べる|探して|검색해|검색|찾아|搜索|查找|搜一下|查询)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || text.trim();
}

function resolveDuckDuckGoUrl(raw: string): string {
  try {
    const decoded = decodeHtml(raw);
    const absolute = decoded.startsWith('//') ? `https:${decoded}` : decoded;
    const parsed = new URL(absolute, 'https://duckduckgo.com');
    const redirected = parsed.searchParams.get('uddg');
    return redirected || parsed.toString();
  } catch {
    return '';
  }
}

function collectVisualSources(message: Message, referenced: Message | null): VisualSource[] {
  const sources: VisualSource[] = [];
  const seen = new Set<string>();

  const collectFromMessage = (target: Message, prefix: string) => {
    for (const attachment of target.attachments.values()) {
      const name = attachment.name ?? 'image';
      const type = attachment.contentType ?? '';
      const looksVisual = type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(name);
      if (!looksVisual || seen.has(attachment.url)) continue;
      seen.add(attachment.url);
      sources.push({
        url: attachment.url,
        animated: type.includes('gif') || /\.gif$/i.test(name),
        label: `${prefix}${name}`
      });
    }

    for (const embed of target.embeds) {
      for (const image of [embed.image, embed.thumbnail]) {
        const url = image?.proxyURL || image?.url;
        if (!url || seen.has(url)) continue;
        seen.add(url);
        sources.push({ url, animated: /\.gif(?:\?|$)/i.test(url), label: `${prefix}embed image` });
      }
    }
  };

  collectFromMessage(message, 'message: ');
  if (referenced) collectFromMessage(referenced, 'reply: ');
  return sources.slice(0, 4);
}

function isVisualAnalysisRequest(text: string): boolean {
  const lower = text.trim().toLocaleLowerCase();
  if (!lower) return false;
  return /\b(bu ne|bu nedir|bu nedir\?|bu görselde ne var|bu resimde ne var|görseli analiz et|resmi analiz et|fotoğrafı analiz et|ne görüyorsun|what is this|what's this|what is in this image|describe this image|analyze this image|analyse this image|que es esto|qué es esto|describe esta imagen|analiza esta imagen|was ist das|beschreibe dieses bild|analysiere dieses bild|qu'est-ce que c'est|décris cette image|analyse cette image|che cos'è|descrivi questa immagine|o que é isso|descreva esta imagem|что это|опиши изображение)\b/i.test(lower) ||
    /(これは何|この画像|画像を分析|これ何|이게 뭐야|이 이미지|이미지 분석|这是什么|这个图片|分析这张图)/i.test(lower);
}

function isImageRequest(text: string): boolean {
  const lower = text.toLocaleLowerCase();
  const imageNouns = [
    'görsel', 'resim', 'görüntü', 'fotoğraf', 'fotograf', 'çizim', 'cizim',
    'image', 'picture', 'photo', 'illustration',
    'imagen', 'foto', 'ilustración', 'ilustracion',
    'bild', 'foto', 'illustration',
    'image', 'photo', 'illustration',
    'immagine', 'foto', 'illustrazione',
    'imagem', 'foto', 'ilustração', 'ilustracao',
    'изображение', 'картинка', 'фото',
    '画像', 'イラスト', '写真',
    '이미지', '그림', '사진',
    '图像', '图片', '照片', '插画'
  ];
  const generationVerbs = [
    'oluştur', 'olustur', 'üret', 'uret', 'yarat', 'tasarla', 'yap', 'hazırla', 'hazirla',
    'generate', 'create', 'make', 'draw', 'render',
    'crear', 'genera', 'generar', 'dibujar', 'dibuja',
    'erstellen', 'generieren', 'zeichnen', 'zeichne',
    'créer', 'creer', 'générer', 'generer', 'dessiner', 'dessine',
    'creare', 'genera', 'generare', 'disegnare', 'disegna',
    'criar', 'gerar', 'desenhar', 'desenha',
    'создай', 'создать', 'сгенерируй', 'нарисуй',
    '作って', '生成', '描いて',
    '만들어', '생성', '그려',
    '生成', '创建', '画', '绘制'
  ];
  const hasImageNoun = imageNouns.some(signal => lower.includes(signal));
  const hasGenerationVerb = generationVerbs.some(signal => lower.includes(signal));
  const explicitDraw = /(çiz|ciz|draw|render|dibuj|zeichn|dessin|disegn|desenh|нарис|描いて|그려|绘制)/i.test(lower);
  return explicitDraw || (hasImageNoun && hasGenerationVerb);
}

function extractImageSubject(text: string): string {
  return text
    .replace(/\b(bana|bir|lütfen|lutfen|please|can you|could you|make me|por favor|bitte|s'il vous plaît|per favore|por favor)\b/gi, ' ')
    .replace(/\b(görsel|resim|görüntü|fotoğraf|fotograf|çizim|cizim|image|picture|photo|illustration|imagen|foto|ilustración|ilustracion|bild|immagine|illustrazione|imagem|ilustração|ilustracao|изображение|картинка)\b/gi, ' ')
    .replace(/\b(çiz|ciz|tasarla|oluştur|olustur|üret|uret|yarat|yap|hazırla|hazirla|render|draw|generate|create|make|crear|genera|generar|dibujar|dibuja|erstellen|generieren|zeichnen|zeichne|créer|creer|générer|generer|dessiner|dessine|creare|generare|disegnare|disegna|criar|gerar|desenhar|desenha|создай|создать|сгенерируй|нарисуй)\b/gi, ' ')
    .replace(/(画像|イラスト|写真|作って|生成|描いて|이미지|그림|사진|만들어|생성|그려|图像|图片|照片|插画|创建|绘制)/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[,.;:!?'"`\-]+|[,.;:!?'"`\-]+$/g, '')
    .trim();
}

function getVisionLanguageInstruction(text: string): string {
  const lower = text.toLocaleLowerCase('tr');
  if (/[çğıöşü]/i.test(text) || /(\bbu\b|\bne\b|görsel|resim|analiz|nedir|ne var)/i.test(lower)) return 'Yanıtını yalnızca Türkçe ver.';
  if (/[ぁ-んァ-ン]/.test(text)) return 'Reply only in Japanese.';
  if (/[가-힣]/.test(text)) return 'Reply only in Korean.';
  if (/[一-龯]/.test(text)) return 'Reply only in Chinese.';
  if (/[А-Яа-яЁё]/.test(text)) return 'Reply only in Russian.';
  if (/(qué|que es|imagen|describe|analiza)/i.test(lower)) return 'Reply only in Spanish.';
  if (/(was ist|bild|beschreibe|analysiere)/i.test(lower)) return 'Reply only in German.';
  if (/(qu'est|décris|analyse cette image)/i.test(lower)) return 'Reply only in French.';
  if (/(cos'è|immagine|descrivi)/i.test(lower)) return 'Reply only in Italian.';
  if (/(o que|imagem|descreva)/i.test(lower)) return 'Reply only in Portuguese.';
  return 'Reply only in the same language as the user question.';
}

async function normalizeVisualInput(raw: Buffer, animated: boolean): Promise<{ buffer: Buffer; frames: number }> {
  if (!animated) {
    const buffer = await sharp(raw, { animated: false })
      .rotate()
      .resize({ width: 1536, height: 1536, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    return { buffer, frames: 1 };
  }

  const metadata = await sharp(raw, { animated: true }).metadata();
  const pageCount = Math.max(1, metadata.pages ?? 1);
  const indices = [...new Set([0, Math.floor((pageCount - 1) / 2), pageCount - 1])];
  const tiles: Buffer[] = [];
  for (const page of indices) {
    const tile = await sharp(raw, { page })
      .rotate()
      .resize({ width: 512, height: 512, fit: 'contain', background: '#ffffff', withoutEnlargement: false })
      .png()
      .toBuffer();
    tiles.push(tile);
  }
  const buffer = await sharp({
    create: { width: 512 * tiles.length, height: 512, channels: 3, background: '#ffffff' }
  }).composite(tiles.map((input, index) => ({ input, left: index * 512, top: 0 }))).png().toBuffer();
  return { buffer, frames: tiles.length };
}

function sanitizeImagePrompt(value: string): string {
  return value
    .replace(/```(?:text|markdown)?/gi, '')
    .replace(/```/g, '')
    .replace(/^\s*(?:prompt|english prompt)\s*:\s*/i, '')
    .replace(/^['"`]+|['"`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1500);
}

function extractVerifiedResearchFact(turns: ChatTurn[], research: string): string {
  const latestUser = [...turns].reverse().find(turn => turn.role === 'user')?.content ?? '';
  const asksForDate = /(ne zaman|hangi tarihte|kaç yılında|tarih|when|what date|cuándo|fecha|wann|datum|quand|quando|data|когда|дата)/i.test(latestUser) || /(いつ|日付|언제|날짜|什么时候|日期)/i.test(latestUser);
  const accessBlockQuestion = /(erişim|erişime|engellendi|engel|yasak|yasaklandı|kapatıldı|blocked|banned|ban)/i.test(latestUser);
  if (!asksForDate || !accessBlockQuestion) return '';

  const firstSource = research.split(/\n\n(?=\[2\])/)[0] ?? research;
  const turkishDate = firstSource.match(/\b\d{1,2}\s+(?:Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+20\d{2}\b/i)?.[0];
  const numericDate = firstSource.match(/\b(?:20\d{2}[-\/.]\d{1,2}[-\/.]\d{1,2}|\d{1,2}[-\/.]\d{1,2}[-\/.]20\d{2})\b/)?.[0];
  const date = turkishDate || numericDate;
  if (!date) return '';
  return `${date} (verified from source [1])`;
}

function ensureResearchCitation(response: string, research: string): string {
  if (/\[\d+\]/.test(response)) return response;
  const first = research.match(/^\[1\]\s+([^\n]+)\nURL:\s*([^\n]+)/m);
  if (!first) return response;
  return `${response}\n\nSource / Kaynak: [1] ${first[1].trim()} — ${first[2].trim()}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendChunked(channel: TextBasedChannel, content: string): Promise<void> {
  if (!('send' in channel) || typeof channel.send !== 'function') throw new Error('This channel cannot send messages.');
  for (let index = 0; index < content.length; index += 1900) {
    await channel.send(content.slice(index, index + 1900));
  }
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      return Number.isFinite(codePoint) && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '';
    })
    .replace(/&#(\d+);/g, (_match, decimal: string) => {
      const codePoint = Number.parseInt(decimal, 10);
      return Number.isFinite(codePoint) && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '';
    });
}
