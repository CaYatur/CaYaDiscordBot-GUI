import { useEffect, useMemo, useState } from 'react';
import { AI_PROMPT_DEFAULTS, AI_PROMPT_SETTING_KEYS, type AiPromptKey } from '../../shared/ai-prompts';
import type { AiModelCatalogEntry, AppLocale, AutoReplyEntry, BlacklistEntry, BotLogEntry, GuildSummary, MusicQueueEntry, WhitelistEntry } from '../../shared/contracts';

const copy = (locale: AppLocale, en: string, tr: string) => locale === 'tr' ? tr : en;

function useGuilds() {
  const [guilds, setGuilds] = useState<GuildSummary[]>([]);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const next = await window.caya.getGuilds();
      if (active) setGuilds(next);
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  return guilds;
}

export function ServersModule({ locale }: { locale: AppLocale }) {
  const guilds = useGuilds();
  return (
    <section className="module-panel">
      <header className="module-header">
        <div><span className="eyebrow">Discord</span><h2>{copy(locale, 'Connected servers', 'Bağlı sunucular')}</h2></div>
        <span className="count-pill">{guilds.length}</span>
      </header>
      <div className="server-grid">
        {guilds.map(guild => (
          <article className="server-card" key={guild.id}>
            <div className="server-avatar">{guild.iconUrl ? <img src={guild.iconUrl} alt="" /> : <span>{guild.name.slice(0, 1).toUpperCase()}</span>}</div>
            <div><strong>{guild.name}</strong><small>{guild.memberCount} {copy(locale, 'members', 'üye')}</small><code>{guild.id}</code></div>
          </article>
        ))}
        {guilds.length === 0 && <Empty text={copy(locale, 'Start the bot to list connected servers.', 'Bağlı sunucuları görmek için botu başlatın.')} />}
      </div>
    </section>
  );
}

export function WhitelistModule({ locale }: { locale: AppLocale }) {
  const [items, setItems] = useState<WhitelistEntry[]>([]);
  const [userId, setUserId] = useState('');
  const [label, setLabel] = useState('');
  const [level, setLevel] = useState<'owner' | 'trusted'>('trusted');
  const [error, setError] = useState('');

  const refresh = async () => setItems(await window.caya.getWhitelist());
  useEffect(() => { void refresh(); }, []);

  const save = async () => {
    try {
      setError('');
      setItems(await window.caya.saveWhitelist({ userId: userId.trim(), label: label.trim() || null, level }));
      setUserId(''); setLabel('');
    } catch (e) { setError(String(e)); }
  };

  return (
    <section className="module-panel">
      <header className="module-header"><div><span className="eyebrow">{copy(locale, 'Permissions', 'Yetkilendirme')}</span><h2>{copy(locale, 'Whitelist', 'Beyaz Liste')}</h2></div></header>
      <p className="module-description">{copy(locale, 'Choose which users can access privileged bot features. Full Access can use owner commands; Trusted users can use management tools and bypass the link filter.', 'Özel bot özelliklerini kullanabilecek kişileri buradan seçin. Tam Yetki sahibi kullanıcılar tüm özel komutları, Güvenilir kullanıcılar ise yönetim araçlarını kullanabilir ve link filtresini geçebilir.')}</p>
      <div className="form-grid three">
        <input value={userId} onChange={e => setUserId(e.target.value)} placeholder={copy(locale, 'Discord User ID', 'Discord Kullanıcı ID')} />
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder={copy(locale, 'Label (optional)', 'Etiket (isteğe bağlı)')} />
        <select value={level} onChange={e => setLevel(e.target.value as 'owner' | 'trusted')}><option value="trusted">{copy(locale, 'Trusted', 'Güvenilir')}</option><option value="owner">{copy(locale, 'Full Access', 'Tam Yetki')}</option></select>
      </div>
      <button className="primary-button compact" onClick={() => void save()} disabled={!userId.trim()}>{copy(locale, 'Save entry', 'Kaydı Kaydet')}</button>
      {error && <div className="error-banner">{error}</div>}
      <DataList items={items.map(item => ({ key: item.userId, title: item.label || item.userId, subtitle: `${item.userId} · ${item.level}`, remove: () => window.caya.removeWhitelist(item.userId).then(setItems) }))} empty={copy(locale, 'No whitelist entries.', 'Beyaz liste kaydı yok.')} removeLabel={copy(locale, 'Remove', 'Kaldır')} />
    </section>
  );
}

export function BlacklistModule({ locale }: { locale: AppLocale }) {
  const [items, setItems] = useState<BlacklistEntry[]>([]);
  const [userId, setUserId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { void window.caya.getBlacklist().then(setItems); }, []);

  const save = async () => {
    try {
      setError('');
      setItems(await window.caya.saveBlacklist({ userId: userId.trim(), reason: reason.trim() || null }));
      setUserId(''); setReason('');
    } catch (e) { setError(String(e)); }
  };

  return (
    <section className="module-panel">
      <header className="module-header"><div><span className="eyebrow">{copy(locale, 'User Access', 'Kullanıcı Erişimi')}</span><h2>{copy(locale, 'Blocked Users', 'Engellenen Kullanıcılar')}</h2></div></header>
      <div className="form-grid two"><input value={userId} onChange={e => setUserId(e.target.value)} placeholder="Discord User ID" /><input value={reason} onChange={e => setReason(e.target.value)} placeholder={copy(locale, 'Reason', 'Sebep')} /></div>
      <button className="primary-button compact" onClick={() => void save()} disabled={!userId.trim()}>{copy(locale, 'Add to blacklist', 'Kara Listeye Ekle')}</button>
      {error && <div className="error-banner">{error}</div>}
      <DataList items={items.map(item => ({ key: item.userId, title: item.userId, subtitle: item.reason || '-', remove: () => window.caya.removeBlacklist(item.userId).then(setItems) }))} empty={copy(locale, 'Blacklist is empty.', 'Kara liste boş.')} removeLabel={copy(locale, 'Remove', 'Kaldır')} />
    </section>
  );
}

export function AutoRepliesModule({ locale }: { locale: AppLocale }) {
  const guilds = useGuilds();
  const [items, setItems] = useState<AutoReplyEntry[]>([]);
  const [guildId, setGuildId] = useState('');
  const [trigger, setTrigger] = useState('');
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { void window.caya.getAutoReplies().then(setItems); }, []);
  useEffect(() => { if (!guildId && guilds[0]) setGuildId(guilds[0].id); }, [guilds, guildId]);

  const add = async () => {
    try {
      setError('');
      setItems(await window.caya.addAutoReply({ guildId: guildId.trim(), trigger: trigger.trim(), response: response.trim() }));
      setTrigger(''); setResponse('');
    } catch (e) { setError(String(e)); }
  };

  return (
    <section className="module-panel">
      <header className="module-header"><div><span className="eyebrow">{copy(locale, 'Automatic Messages', 'Otomatik Mesajlar')}</span><h2>{copy(locale, 'Auto Replies', 'Otomatik Cevaplar')}</h2></div></header>
      <div className="form-grid three">
        <GuildSelect guilds={guilds} value={guildId} onChange={setGuildId} locale={locale} />
        <input value={trigger} onChange={e => setTrigger(e.target.value)} placeholder={copy(locale, 'Trigger text', 'Tetikleyici metin')} />
        <input value={response} onChange={e => setResponse(e.target.value)} placeholder={copy(locale, 'Response', 'Cevap')} />
      </div>
      <button className="primary-button compact" disabled={!guildId || !trigger.trim() || !response.trim()} onClick={() => void add()}>{copy(locale, 'Add reply', 'Cevap Ekle')}</button>
      {error && <div className="error-banner">{error}</div>}
      <DataList items={items.map(item => ({ key: String(item.id), title: item.trigger, subtitle: `${item.response} · ${item.guildId}`, remove: () => window.caya.removeAutoReply(item.id).then(setItems) }))} empty={copy(locale, 'No auto replies.', 'Otomatik cevap yok.')} removeLabel={copy(locale, 'Remove', 'Kaldır')} />
    </section>
  );
}

export function ModerationModule({ locale }: { locale: AppLocale }) {
  const guilds = useGuilds();
  const [guildId, setGuildId] = useState('');
  const [linkFilter, setLinkFilter] = useState(false);
  const [ipAddress, setIpAddress] = useState('');
  const [ipPort, setIpPort] = useState('');
  const [ipVersion, setIpVersion] = useState('');
  const [ipColor, setIpColor] = useState('#5865f2');
  const [ipEnabled, setIpEnabled] = useState(false);
  useEffect(() => { if (!guildId && guilds[0]) setGuildId(guilds[0].id); }, [guilds, guildId]);
  useEffect(() => {
    if (!guildId) return;
    void window.caya.getGuildSetting(guildId, 'link_filter').then(value => setLinkFilter(value === 'true'));
    void window.caya.getIpProfile(guildId).then(profile => {
      setIpAddress(profile?.address ?? '');
      setIpPort(profile?.port ?? '');
      setIpVersion(profile?.version ?? '');
      setIpColor(profile?.color ?? '#5865f2');
      setIpEnabled(profile?.enabled ?? false);
    });
  }, [guildId]);
  const toggle = async () => {
    const next = !linkFilter;
    setLinkFilter(next);
    if (guildId) await window.caya.setGuildSetting(guildId, 'link_filter', String(next));
  };
  const saveIp = async () => {
    if (!guildId || !ipAddress.trim() || !ipPort.trim() || !ipVersion.trim()) return;
    await window.caya.setIpProfile(guildId, { address: ipAddress.trim(), port: ipPort.trim(), version: ipVersion.trim(), color: ipColor, enabled: ipEnabled });
  };
  return (
    <section className="module-panel">
      <header className="module-header"><div><span className="eyebrow">{copy(locale, 'Server Safety', 'Sunucu Güvenliği')}</span><h2>{copy(locale, 'Moderation', 'Moderasyon')}</h2></div></header>
      <div className="form-grid one"><GuildSelect guilds={guilds} value={guildId} onChange={setGuildId} locale={locale} /></div>
      <div className="setting-row"><div><strong>{copy(locale, 'Link filter', 'Link filtresi')}</strong><small>{copy(locale, 'When enabled, non-admin users are blocked from posting links except Tenor. Whitelisted users bypass this filter.', 'Açıkken yönetici olmayan kullanıcıların Tenor dışındaki linkleri engellenir. Beyaz listedeki kullanıcılar filtreyi atlar.')}</small></div><button className={linkFilter ? 'toggle active' : 'toggle'} onClick={() => void toggle()}><span /></button></div>
      <h3 className="subheading">{copy(locale, 'Server IP profile', 'Sunucu IP profili')}</h3>
      <div className="form-grid two">
        <input value={ipAddress} onChange={e => setIpAddress(e.target.value)} placeholder={copy(locale, 'Address', 'Adres')} />
        <input value={ipPort} onChange={e => setIpPort(e.target.value)} placeholder="Port" />
        <input value={ipVersion} onChange={e => setIpVersion(e.target.value)} placeholder={copy(locale, 'Version', 'Sürüm')} />
        <input value={ipColor} onChange={e => setIpColor(e.target.value)} placeholder="#5865f2" />
      </div>
      <div className="setting-row"><div><strong>{copy(locale, 'Enable /ip profile', '/ip profilini etkinleştir')}</strong><small>{copy(locale, 'The /ip command uses this profile.', '/ip komutu bu profili kullanır.')}</small></div><button className={ipEnabled ? 'toggle active' : 'toggle'} onClick={() => setIpEnabled(v => !v)}><span /></button></div>
      <button className="primary-button compact" disabled={!guildId || !ipAddress.trim() || !ipPort.trim() || !ipVersion.trim()} onClick={() => void saveIp()}>{copy(locale, 'Save IP profile', 'IP Profilini Kaydet')}</button>
    </section>
  );
}

export function MusicModule({ locale }: { locale: AppLocale }) {
  const guilds = useGuilds();
  const [guildId, setGuildId] = useState('');
  const [queue, setQueue] = useState<MusicQueueEntry[]>([]);
  const [bitrate, setBitrate] = useState('96');
  const [ytDlp, setYtDlp] = useState('yt-dlp');
  useEffect(() => { void window.caya.getSetting('yt_dlp_path').then(value => setYtDlp(value || 'yt-dlp')); }, []);
  useEffect(() => { if (!guildId && guilds[0]) setGuildId(guilds[0].id); }, [guilds, guildId]);
  useEffect(() => {
    if (!guildId) return;
    void window.caya.getGuildSetting(guildId, 'music_bitrate').then(value => setBitrate(value || '96'));
    let active = true;
    const refresh = async () => { const next = await window.caya.getMusicQueue(guildId); if (active) setQueue(next); };
    void refresh(); const timer = window.setInterval(() => void refresh(), 2500);
    return () => { active = false; window.clearInterval(timer); };
  }, [guildId]);
  const save = async () => {
    await window.caya.setSetting('yt_dlp_path', ytDlp.trim() || 'yt-dlp');
    if (guildId) await window.caya.setGuildSetting(guildId, 'music_bitrate', bitrate);
  };
  return (
    <section className="module-panel">
      <header className="module-header"><div><span className="eyebrow">{copy(locale, 'Music Playback', 'Müzik Oynatma')}</span><h2>{copy(locale, 'Music', 'Müzik')}</h2></div></header>
      <div className="form-grid three"><GuildSelect guilds={guilds} value={guildId} onChange={setGuildId} locale={locale} /><select value={bitrate} onChange={e => { const next = e.target.value; setBitrate(next); if (guildId) void window.caya.setGuildSetting(guildId, 'music_bitrate', next); }}>{['48','64','96','128','192','256','320'].map(v => <option key={v} value={v}>{v} kbps</option>)}</select><input value={ytDlp} onChange={e => setYtDlp(e.target.value)} onBlur={() => void window.caya.setSetting('yt_dlp_path', ytDlp.trim() || 'yt-dlp')} placeholder="yt-dlp path" /></div>
      <button className="primary-button compact" onClick={() => void save()}>{copy(locale, 'Save music settings', 'Müzik Ayarlarını Kaydet')}</button>
      <h3 className="subheading">{copy(locale, 'Current queue', 'Mevcut sıra')}</h3>
      <DataList items={queue.map((item, index) => ({ key: `${index}-${item.url}`, title: item.title, subtitle: `${copy(locale, 'Requested by', 'İsteyen')}: ${item.requestedBy}` }))} empty={copy(locale, 'Queue is empty.', 'Sıra boş.')} />
    </section>
  );
}

export function GamesModule({ locale }: { locale: AppLocale }) {
  return (
    <section className="module-panel">
      <header className="module-header"><div><span className="eyebrow">{copy(locale, 'Interactive Features', 'Etkileşimli Özellikler')}</span><h2>{copy(locale, 'Games', 'Oyunlar')}</h2></div></header>
      <p className="module-description">{copy(locale, 'Game features are grouped here. New games can be added to this category without mixing them with moderation or music settings.', 'Oyun özellikleri bu kategoride toplanır. Yeni oyunlar moderasyon veya müzik ayarlarına karışmadan bu bölüme eklenebilir.')}</p>
      <div className="setting-row"><div><strong>{copy(locale, 'Multiplayer Rock Paper Scissors', 'Çok Oyunculu Taş-Kağıt-Makas')}</strong><small>{copy(locale, 'Invite 1-7 users with c!taşkağıtmakas @user... Invitations, private choices, elimination rounds and persistent wins are handled automatically.', 'c!taşkağıtmakas @kullanıcı... ile 1-7 kullanıcı davet edilir. Davetler, gizli seçimler, eleme turları ve kalıcı galibiyet sayıları otomatik yönetilir.')}</small></div><span className="count-pill">2-8</span></div>
      <div className="setting-row"><div><strong>{copy(locale, 'Rock Paper Scissors vs Bot', 'Bota Karşı Taş-Kağıt-Makas')}</strong><small>{copy(locale, 'Use /rps or c!taşkağıtmakas taş|kağıt|makas. Wins are saved per Discord user.', '/rps veya c!taşkağıtmakas taş|kağıt|makas kullanılır. Galibiyetler Discord kullanıcısına göre kaydedilir.')}</small></div><code>/rps</code></div>
      <div className="setting-row"><div><strong>{copy(locale, 'Raffle / Random Choice', 'Kura / Rastgele Seçim')}</strong><small>{copy(locale, 'Use /kura with comma-separated choices.', '/kura ile virgülle ayrılmış seçenekler arasından seçim yapılır.')}</small></div><code>/kura</code></div>
      <div className="setting-row"><div><strong>{copy(locale, 'Win Counter', 'Galibiyet Sayacı')}</strong><small>{copy(locale, 'Use c!wins or c!wins @user to view saved Rock Paper Scissors wins.', 'Kaydedilmiş Taş-Kağıt-Makas galibiyetlerini görmek için c!wins veya c!wins @kullanıcı kullanılır.')}</small></div><code>c!wins</code></div>
    </section>
  );
}

export function AiModule({ locale }: { locale: AppLocale }) {
  const [aiEnabled, setAiEnabled] = useState(false);
  const [llmEnabled, setLlmEnabled] = useState(true);
  const [ollamaUrl, setOllamaUrl] = useState('http://127.0.0.1:11434');
  const [ollamaCatalog, setOllamaCatalog] = useState<AiModelCatalogEntry[]>([]);
  const [chatModel, setChatModel] = useState('');
  const [webModel, setWebModel] = useState('');
  const [imagePromptModel, setImagePromptModel] = useState('');
  const [visionModel, setVisionModel] = useState('');
  const [webSearch, setWebSearch] = useState(true);
  const [comfyUrl, setComfyUrl] = useState('http://127.0.0.1:8000');
  const [comfyModel, setComfyModel] = useState('');
  const [comfyModels, setComfyModels] = useState<string[]>([]);
  const [imageEnabled, setImageEnabled] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [comfyStatus, setComfyStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [ollamaResult, setOllamaResult] = useState('');
  const [comfyResult, setComfyResult] = useState('');
  const [openPrompt, setOpenPrompt] = useState<AiPromptKey | null>(null);
  const [prompts, setPrompts] = useState<Record<AiPromptKey, string>>({ ...AI_PROMPT_DEFAULTS });

  const loadOllamaModels = async (url: string, preferred?: { legacy?: string | null; chat?: string | null; web?: string | null; imagePrompt?: string | null; vision?: string | null }) => {
    const result = await window.caya.getOllamaModelCatalog(url);
    setOllamaCatalog(result.models);
    if (result.ok) {
      setOllamaStatus('ok');
      setOllamaResult(result.message);
      const names = result.models.map(item => item.name);
      const visionNames = result.models.filter(item => item.capabilities.includes('vision')).map(item => item.name);
      const pick = (value?: string | null, fallback?: string | null) => {
        const candidate = value || fallback || '';
        return candidate && names.includes(candidate) ? candidate : (names[0] ?? '');
      };
      const nextChat = pick(preferred?.chat, preferred?.legacy);
      const nextWeb = pick(preferred?.web, nextChat);
      const nextImagePrompt = pick(preferred?.imagePrompt, nextChat);
      const visionCandidate = preferred?.vision || '';
      const recommendedVision = visionNames.find(name => /(?:^|[-_:])(vl|vision)(?:[-_:]|$)/i.test(name))
        ?? visionNames.find(name => /qwen.*vl/i.test(name))
        ?? visionNames[0]
        ?? '';
      const nextVision = visionCandidate && visionNames.includes(visionCandidate) ? visionCandidate : recommendedVision;
      setChatModel(nextChat);
      setWebModel(nextWeb);
      setImagePromptModel(nextImagePrompt);
      setVisionModel(nextVision);
      await Promise.all([
        window.caya.setSetting('ollama_chat_model', nextChat),
        window.caya.setSetting('ollama_web_model', nextWeb),
        window.caya.setSetting('ollama_image_prompt_model', nextImagePrompt),
        window.caya.setSetting('ollama_vision_model', nextVision)
      ]);
    } else {
      setOllamaStatus('error');
      setOllamaResult(result.message);
      setOllamaCatalog([]);
      setChatModel('');
      setWebModel('');
      setImagePromptModel('');
      setVisionModel('');
    }
    return result;
  };

  const loadComfyModels = async (url: string, preferred?: string | null) => {
    const result = await window.caya.getComfyCheckpoints(url);
    setComfyModels(result.models);
    if (result.ok) {
      setComfyStatus('ok');
      setComfyResult(result.message);
      const selected = preferred && result.models.includes(preferred) ? preferred : (result.models[0] ?? '');
      setComfyModel(selected);
      if (selected) await window.caya.setSetting('comfyui_model', selected);
    } else {
      setComfyStatus('error');
      setComfyResult(result.message);
      setComfyModel('');
    }
    return result;
  };

  useEffect(() => {
    void (async () => {
      const [enabled, llm, url, legacyModel, chat, web, imagePrompt, vision, search, comfy, imageModel, image] = await Promise.all([
        window.caya.getSetting('ai_enabled'),
        window.caya.getSetting('ai_llm_enabled'),
        window.caya.getSetting('ollama_url'),
        window.caya.getSetting('ollama_model'),
        window.caya.getSetting('ollama_chat_model'),
        window.caya.getSetting('ollama_web_model'),
        window.caya.getSetting('ollama_image_prompt_model'),
        window.caya.getSetting('ollama_vision_model'),
        window.caya.getSetting('ai_web_search'),
        window.caya.getSetting('comfyui_url'),
        window.caya.getSetting('comfyui_model'),
        window.caya.getSetting('ai_image_enabled')
      ]);
      setAiEnabled(enabled === 'true');
      setLlmEnabled(llm !== 'false');
      const resolvedOllamaUrl = url || 'http://127.0.0.1:11434';
      const resolvedComfyUrl = comfy || 'http://127.0.0.1:8000';
      setOllamaUrl(resolvedOllamaUrl);
      setWebSearch(search !== 'false');
      setComfyUrl(resolvedComfyUrl);
      setImageEnabled(image === 'true');
      await Promise.all([
        loadOllamaModels(resolvedOllamaUrl, { legacy: legacyModel, chat, web, imagePrompt, vision }),
        loadComfyModels(resolvedComfyUrl, imageModel)
      ]);

      const keys = Object.keys(AI_PROMPT_DEFAULTS) as AiPromptKey[];
      const stored = await Promise.all(keys.map(key => window.caya.getSetting(AI_PROMPT_SETTING_KEYS[key])));
      setPrompts(Object.fromEntries(keys.map((key, index) => [key, stored[index] ?? AI_PROMPT_DEFAULTS[key]])) as Record<AiPromptKey, string>);
    })();
  }, []);

  const save = async () => {
    await Promise.all([
      window.caya.setSetting('ai_enabled', String(aiEnabled)),
      window.caya.setSetting('ai_llm_enabled', String(llmEnabled)),
      window.caya.setSetting('ollama_url', ollamaUrl),
      window.caya.setSetting('ollama_chat_model', chatModel),
      window.caya.setSetting('ollama_web_model', webModel),
      window.caya.setSetting('ollama_image_prompt_model', imagePromptModel),
      window.caya.setSetting('ollama_vision_model', visionModel),
      window.caya.setSetting('ai_web_search', String(webSearch)),
      window.caya.setSetting('comfyui_url', comfyUrl),
      window.caya.setSetting('comfyui_model', comfyModel),
      window.caya.setSetting('ai_image_enabled', String(imageEnabled))
    ]);
  };

  const persistToggle = (key: string, next: boolean, setter: (value: boolean) => void) => {
    setter(next);
    void window.caya.setSetting(key, String(next));
  };

  const testOllama = async () => {
    setOllamaStatus('testing');
    setOllamaResult('');
    const connection = await window.caya.testOllamaConnection(ollamaUrl);
    if (!connection.ok) {
      setOllamaCatalog([]);
      setChatModel('');
      setWebModel('');
      setImagePromptModel('');
      setVisionModel('');
      setOllamaStatus('error');
      setOllamaResult(connection.message);
      return;
    }
    await loadOllamaModels(ollamaUrl, { chat: chatModel, web: webModel, imagePrompt: imagePromptModel, vision: visionModel });
  };

  const testComfy = async () => {
    setComfyStatus('testing');
    setComfyResult('');
    const connection = await window.caya.testComfyConnection(comfyUrl);
    if (!connection.ok) {
      setComfyModels([]);
      setComfyModel('');
      setComfyStatus('error');
      setComfyResult(connection.message);
      return;
    }
    await loadComfyModels(comfyUrl, comfyModel);
  };

  const savePrompt = async (key: AiPromptKey) => {
    await window.caya.setSetting(AI_PROMPT_SETTING_KEYS[key], prompts[key]);
  };

  const resetPrompt = async (key: AiPromptKey) => {
    const value = AI_PROMPT_DEFAULTS[key];
    setPrompts(current => ({ ...current, [key]: value }));
    await window.caya.setSetting(AI_PROMPT_SETTING_KEYS[key], value);
  };

  const aiSaveBlocked = aiEnabled && ((llmEnabled && !chatModel) || (webSearch && !webModel) || (imageEnabled && (!imagePromptModel || !comfyModel)));
  const ollamaModels = ollamaCatalog.map(item => item.name);
  const visionModels = ollamaCatalog.filter(item => item.capabilities.includes('vision')).map(item => item.name);

  const promptLabels: Record<AiPromptKey, { title: string; description: string; variables: string }> = {
    assistantSystem: { title: copy(locale, 'Assistant identity and language', 'Asistan kimliği ve dil'), description: copy(locale, 'Controls the assistant identity, language and exact model-name response.', 'Asistanın kimliğini, dilini ve model adı sorularına verdiği cevabı belirler.'), variables: '{{model}}' },
    assistantBehavior: { title: copy(locale, 'Accuracy and behavior rules', 'Doğruluk ve davranış kuralları'), description: copy(locale, 'Controls hallucination prevention, honesty and conversation-history behavior.', 'Uydurma bilgi üretmeme, doğruluk ve konuşma geçmişi davranışını belirler.'), variables: '{{model}}' },
    webResearchContext: { title: copy(locale, 'Web research rules', 'Web araştırma kuralları'), description: copy(locale, 'Controls how search sources are interpreted and cited.', 'Web kaynaklarının nasıl yorumlanacağını ve kaynak gösterileceğini belirler.'), variables: '{{research}}' },
    visionAnalysis: { title: copy(locale, 'Image analysis rules', 'Görsel analiz kuralları'), description: copy(locale, 'Controls how uploaded images, replied images and GIF frames are analyzed.', 'Yüklenen görsellerin, yanıtlanan görsellerin ve GIF karelerinin nasıl analiz edileceğini belirler.'), variables: copy(locale, 'No variables', 'Değişken yok') },
    imagePromptRewrite: { title: copy(locale, 'Image prompt translation', 'Görsel prompt çevirisi'), description: copy(locale, 'Controls how user image requests are converted into a clean English prompt before ComfyUI.', 'Kullanıcının görsel isteğinin ComfyUI öncesinde temiz bir İngilizce prompta nasıl çevrileceğini belirler.'), variables: copy(locale, 'No variables', 'Değişken yok') },
    imagePromptTemplate: { title: copy(locale, 'Image prompt template', 'Görsel prompt şablonu'), description: copy(locale, 'Wraps or transforms the translated image request before it is sent to ComfyUI.', 'Çevrilmiş görsel isteğini ComfyUI’ye göndermeden önce biçimlendirir.'), variables: '{{prompt}}' },
    imageNegativePrompt: { title: copy(locale, 'Image negative prompt', 'Görsel negatif prompt'), description: copy(locale, 'Default negative prompt sent with every generated image.', 'Her görsel oluşturma isteğiyle birlikte gönderilen varsayılan negatif prompt.'), variables: copy(locale, 'No variables', 'Değişken yok') }
  };

  return (
    <section className="module-panel">
      <header className="module-header"><div><span className="eyebrow">{copy(locale, 'AI Assistant', 'Yapay Zeka Asistanı')}</span><h2>{copy(locale, 'AI Settings', 'Yapay Zeka Ayarları')}</h2></div></header>

      <div className="setting-row emphasis"><div><strong>{copy(locale, 'Enable AI features', 'Yapay zeka kategorisini aç')}</strong><small>{copy(locale, 'Master switch for all AI features. It is off by default on a new installation.', 'Tüm yapay zeka özelliklerinin ana anahtarıdır. Yeni kurulumda varsayılan olarak kapalıdır.')}</small></div><button className={aiEnabled ? 'toggle active' : 'toggle'} onClick={() => persistToggle('ai_enabled', !aiEnabled, setAiEnabled)}><span /></button></div>

      <div className={!aiEnabled ? 'setting-row disabled' : 'setting-row'}><div><strong>{copy(locale, 'LLM chat', 'LLM sohbeti')}</strong><small>{copy(locale, 'Use the configured Ollama model when the bot is mentioned or replied to.', 'Bot etiketlendiğinde veya yanıtlandığında yapılandırılmış Ollama modelini kullanır.')}</small></div><button disabled={!aiEnabled} className={llmEnabled ? 'toggle active' : 'toggle'} onClick={() => persistToggle('ai_llm_enabled', !llmEnabled, setLlmEnabled)}><span /></button></div>
      <div className={!aiEnabled ? 'setting-row disabled' : 'setting-row'}><div><strong>{copy(locale, 'Web research', 'Web araştırması')}</strong><small>{copy(locale, 'Searches the web for explicit research requests and time-sensitive questions. Unsupported results are not guessed.', 'Açık araştırma isteklerinde ve güncel sorularda web araması yapar. Kaynak bulunamazsa tahmin üretmez.')}</small></div><button disabled={!aiEnabled} className={webSearch ? 'toggle active' : 'toggle'} onClick={() => persistToggle('ai_web_search', !webSearch, setWebSearch)}><span /></button></div>
      <div className={!aiEnabled ? 'setting-row disabled' : 'setting-row'}><div><strong>{copy(locale, 'Image generation', 'Görsel oluşturma')}</strong><small>{copy(locale, 'Uses the selected Ollama model to normalize the request into an English image prompt, then generates it with ComfyUI.', 'İsteği önce seçili Ollama modeliyle temiz bir İngilizce görsel promptuna dönüştürür, ardından ComfyUI ile görseli üretir.')}</small></div><button disabled={!aiEnabled} className={imageEnabled ? 'toggle active' : 'toggle'} onClick={() => persistToggle('ai_image_enabled', !imageEnabled, setImageEnabled)}><span /></button></div>

      <h3 className="subheading">{copy(locale, 'AI connections', 'Yapay zeka bağlantıları')}</h3>
      <div className="ai-connection-grid">
        <div className="connection-card">
          <div className="connection-card-head"><div><strong>Ollama</strong><small>{copy(locale, `${ollamaModels.length} models · ${visionModels.length} vision`, `${ollamaModels.length} model · ${visionModels.length} görsel destekli`)}</small></div><ConnectionState locale={locale} state={ollamaStatus} /></div>
          <input value={ollamaUrl} onChange={e => { setOllamaUrl(e.target.value); setOllamaStatus('idle'); setOllamaCatalog([]); setChatModel(''); setWebModel(''); setImagePromptModel(''); setVisionModel(''); setOllamaResult(''); }} onBlur={() => void window.caya.setSetting('ollama_url', ollamaUrl)} placeholder="Ollama URL" />
          <div className="model-layer-grid">
            <label><span>{copy(locale, 'Chat response model', 'Sohbet yanıt modeli')}</span><select value={chatModel} onChange={e => { const next = e.target.value; setChatModel(next); void window.caya.setSetting('ollama_chat_model', next); }} disabled={ollamaModels.length === 0}><option value="">{copy(locale, 'Select model', 'Model seç')}</option>{ollamaModels.map(item => <option key={`chat-${item}`} value={item}>{item}</option>)}</select><small>{copy(locale, 'Used for normal conversation.', 'Normal sohbet yanıtlarında kullanılır.')}</small></label>
            <label><span>{copy(locale, 'Web research response model', 'Web araştırma yanıt modeli')}</span><select value={webModel} onChange={e => { const next = e.target.value; setWebModel(next); void window.caya.setSetting('ollama_web_model', next); }} disabled={ollamaModels.length === 0}><option value="">{copy(locale, 'Select model', 'Model seç')}</option>{ollamaModels.map(item => <option key={`web-${item}`} value={item}>{item}</option>)}</select><small>{copy(locale, 'Answers using collected web sources.', 'Toplanan web kaynaklarını kullanarak yanıt verir.')}</small></label>
            <label><span>{copy(locale, 'Image prompt model', 'Görsel prompt modeli')}</span><select value={imagePromptModel} onChange={e => { const next = e.target.value; setImagePromptModel(next); void window.caya.setSetting('ollama_image_prompt_model', next); }} disabled={ollamaModels.length === 0}><option value="">{copy(locale, 'Select model', 'Model seç')}</option>{ollamaModels.map(item => <option key={`prompt-${item}`} value={item}>{item}</option>)}</select><small>{copy(locale, 'Normalizes multilingual requests before ComfyUI.', 'Çok dilli görsel isteklerini ComfyUI öncesinde dönüştürür.')}</small></label>
            <label><span>{copy(locale, 'Image analysis model', 'Görsel analiz modeli')}</span><select value={visionModel} onChange={e => { const next = e.target.value; setVisionModel(next); void window.caya.setSetting('ollama_vision_model', next); }} disabled={visionModels.length === 0}><option value="">{visionModels.length === 0 ? copy(locale, 'No vision model found', 'Görsel destekli model bulunamadı') : copy(locale, 'Select vision model', 'Görsel modeli seç')}</option>{visionModels.map(item => <option key={`vision-${item}`} value={item}>{item}</option>)}</select><small>{copy(locale, 'Only models reporting the Ollama vision capability are listed.', 'Yalnız Ollama vision yeteneği bildiren modeller listelenir.')}</small></label>
          </div>
          {ollamaResult && <small className="connection-detail">{ollamaResult}</small>}
          <button className="secondary-button compact" onClick={() => void testOllama()} disabled={ollamaStatus === 'testing'}>{copy(locale, 'Test connection', 'Bağlantıyı Test Et')}</button>
        </div>
        <div className="connection-card">
          <div className="connection-card-head"><div><strong>ComfyUI</strong><small>{comfyModel}</small></div><ConnectionState locale={locale} state={comfyStatus} /></div>
          <input value={comfyUrl} onChange={e => { setComfyUrl(e.target.value); setComfyStatus('idle'); setComfyModels([]); setComfyModel(''); setComfyResult(''); }} onBlur={() => void window.caya.setSetting('comfyui_url', comfyUrl)} placeholder="ComfyUI URL" />
          <select value={comfyModel} onChange={e => { const next = e.target.value; setComfyModel(next); void window.caya.setSetting('comfyui_model', next); }} disabled={comfyModels.length === 0}>
            <option value="">{comfyModels.length === 0 ? copy(locale, 'No checkpoints loaded', 'Checkpoint listesi yüklenmedi') : copy(locale, 'Select checkpoint', 'Checkpoint seç')}</option>
            {comfyModels.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
          {comfyResult && <small className="connection-detail">{comfyResult}</small>}
          <button className="secondary-button compact" onClick={() => void testComfy()} disabled={comfyStatus === 'testing'}>{copy(locale, 'Test connection', 'Bağlantıyı Test Et')}</button>
        </div>
      </div>

      {aiSaveBlocked && <div className="error-banner">{copy(locale, 'Select a model for every enabled AI service before saving.', 'Kaydetmeden önce açık olan her yapay zeka servisi için bir model seçin.')}</div>}
      <button className="primary-button compact" disabled={aiSaveBlocked} onClick={() => void save()}>{copy(locale, 'Save AI settings', 'Yapay Zeka Ayarlarını Kaydet')}</button>

      <h3 className="subheading">{copy(locale, 'System prompts', 'Sistem Promptları')}</h3>
      <p className="module-description">{copy(locale, 'Each prompt is stored separately. You can edit, save or restore each one without changing the others.', 'Her prompt ayrı saklanır. Diğerlerini etkilemeden düzenleyebilir, kaydedebilir veya varsayılana döndürebilirsiniz.')}</p>
      <div className="prompt-list">
        {(Object.keys(AI_PROMPT_DEFAULTS) as AiPromptKey[]).map(key => {
          const info = promptLabels[key];
          const expanded = openPrompt === key;
          return <div className={expanded ? 'prompt-card expanded' : 'prompt-card'} key={key}>
            <button className="prompt-card-toggle" onClick={() => setOpenPrompt(expanded ? null : key)}>
              <span><strong>{info.title}</strong><small>{info.description}</small></span>
              <span className="prompt-action-text">{expanded ? copy(locale, 'Close', 'Kapat') : copy(locale, 'Edit', 'Düzenle')}</span>
            </button>
            {expanded && <div className="prompt-editor">
              <small>{copy(locale, 'Available variables', 'Kullanılabilir değişkenler')}: <code>{info.variables}</code></small>
              <textarea value={prompts[key]} onChange={e => setPrompts(current => ({ ...current, [key]: e.target.value }))} spellCheck={false} />
              <div className="prompt-buttons">
                <button className="secondary-button compact" onClick={() => void resetPrompt(key)}>{copy(locale, 'Restore default', 'Varsayılana Döndür')}</button>
                <button className="primary-button compact" onClick={() => void savePrompt(key)}>{copy(locale, 'Save prompt', 'Promptu Kaydet')}</button>
              </div>
            </div>}
          </div>;
        })}
      </div>
    </section>
  );
}

export function LogsModule({ locale }: { locale: AppLocale }) {
  const [logs, setLogs] = useState<BotLogEntry[]>([]);
  useEffect(() => {
    let active = true;
    const refresh = async () => { const next = await window.caya.getLogs(); if (active) setLogs(next); };
    void refresh(); const timer = window.setInterval(() => void refresh(), 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  return (
    <section className="module-panel">
      <header className="module-header"><div><span className="eyebrow">{copy(locale, 'Activity', 'Uygulama Geçmişi')}</span><h2>{copy(locale, 'Logs', 'Loglar')}</h2></div></header>
      <div className="log-list">{logs.map((log, index) => <div className={`log-row ${log.level}`} key={`${log.time}-${index}`}><time>{new Date(log.time).toLocaleTimeString()}</time><strong>{formatLogLevel(locale, log.level)}</strong><span>{formatLogMessage(locale, log.message)}</span></div>)}{logs.length === 0 && <Empty text={copy(locale, 'No activity has been recorded yet.', 'Henüz kayıtlı bir işlem yok.')} />}</div>
    </section>
  );
}

function ConnectionState({ locale, state }: { locale: AppLocale; state: 'idle' | 'testing' | 'ok' | 'error' }) {
  const label = state === 'ok'
    ? copy(locale, 'Connected', 'Bağlı')
    : state === 'error'
      ? copy(locale, 'Unreachable', 'Ulaşılamıyor')
      : state === 'testing'
        ? copy(locale, 'Testing', 'Test ediliyor')
        : copy(locale, 'Not tested', 'Test edilmedi');
  return <span className={`service-state ${state}`}>{label}</span>;
}

function GuildSelect({ guilds, value, onChange, locale }: { guilds: GuildSummary[]; value: string; onChange: (value: string) => void; locale: AppLocale }) {
  return <select value={value} onChange={e => onChange(e.target.value)}><option value="">{copy(locale, 'Select server', 'Sunucu seç')}</option>{guilds.map(g => <option value={g.id} key={g.id}>{g.name}</option>)}</select>;
}

function DataList({ items, empty, removeLabel = 'Remove' }: { items: Array<{ key: string; title: string; subtitle: string; remove?: () => Promise<unknown> }>; empty: string; removeLabel?: string }) {
  const content = useMemo(() => items, [items]);
  if (!content.length) return <Empty text={empty} />;
  return <div className="data-list">{content.map(item => <div className="data-row" key={item.key}><div><strong>{item.title}</strong><small>{item.subtitle}</small></div>{item.remove && <button className="danger-button" onClick={() => void item.remove?.()}>{removeLabel}</button>}</div>)}</div>;
}

function formatLogLevel(locale: AppLocale, level: BotLogEntry['level']): string {
  if (locale === 'tr') {
    if (level === 'error') return 'HATA';
    if (level === 'warn') return 'UYARI';
    return 'BİLGİ';
  }
  return level.toUpperCase();
}

function formatLogMessage(locale: AppLocale, message: string): string {
  if (locale !== 'tr') return message;

  if (message === 'Discord bot connection is starting.') return 'Discord bağlantısı başlatılıyor.';
  const connected = message.match(/^Discord connected as (.+); (\d+) guild\(s\)\.$/);
  if (connected) return `Discord'a ${connected[1]} hesabıyla bağlanıldı. ${connected[2]} sunucu bulundu.`;
  const registered = message.match(/^(\d+) slash command\(s\) registered\.$/);
  if (registered) return `${registered[1]} Discord komutu başarıyla kaydedildi.`;
  if (message.startsWith('Discord login failed:')) return `Discord'a giriş başarısız:${message.slice('Discord login failed:'.length)}`;
  if (message.startsWith('Discord client error:')) return `Discord bağlantı hatası:${message.slice('Discord client error:'.length)}`;
  if (message.startsWith('Command registration:')) return `Discord komutları kaydedilemedi:${message.slice('Command registration:'.length)}`;
  if (message.startsWith('AI request failed:')) return `Yapay zeka isteği başarısız:${message.slice('AI request failed:'.length)}`;
  if (message.startsWith('Music player error')) return `Müzik oynatma hatası: ${message}`;
  if (message.startsWith('Slash command ')) return `Bir Discord komutu çalıştırılırken hata oluştu: ${message}`;
  if (message.startsWith('Button ')) return `Bir düğme işlemi başarısız oldu: ${message}`;
  if (message.startsWith('Message handler failed')) return `Bir mesaj işlenirken hata oluştu: ${message}`;
  if (message.startsWith('Link filter removed')) return `Link filtresi bir mesajı kaldırdı. ${message}`;
  return message;
}

function Empty({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}
