import { useEffect, useMemo, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import type { AppLocale, AppState, BotStatus } from '../shared/contracts';
import { t, type TranslationKey } from './i18n';
import { AiModule, AutoRepliesModule, BlacklistModule, GamesModule, LogsModule, ModerationModule, MusicModule, ServersModule, WhitelistModule } from './modules/ControlModules';
import {
  AiIcon,
  BanIcon,
  DashboardIcon,
  DatabaseIcon,
  FolderIcon,
  GameIcon,
  KeyIcon,
  LogIcon,
  MessageIcon,
  MusicIcon,
  ServerIcon,
  SettingsIcon,
  ShieldIcon
} from './components/icons';

type Section = 'dashboard' | 'servers' | 'music' | 'games' | 'ai' | 'autoReplies' | 'moderation' | 'whitelist' | 'blacklist' | 'logs' | 'settings';

type NavItem = {
  id: Section;
  label: TranslationKey;
  icon: ComponentType<{ size?: number }>;
};

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'dashboard', icon: DashboardIcon },
  { id: 'servers', label: 'servers', icon: ServerIcon },
  { id: 'music', label: 'music', icon: MusicIcon },
  { id: 'games', label: 'games', icon: GameIcon },
  { id: 'ai', label: 'ai', icon: AiIcon },
  { id: 'autoReplies', label: 'autoReplies', icon: MessageIcon },
  { id: 'moderation', label: 'moderation', icon: ShieldIcon },
  { id: 'whitelist', label: 'whitelist', icon: KeyIcon },
  { id: 'blacklist', label: 'blacklist', icon: BanIcon },
  { id: 'logs', label: 'logs', icon: LogIcon },
  { id: 'settings', label: 'settings', icon: SettingsIcon }
];

export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [activeSection, setActiveSection] = useState<Section>('dashboard');
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [token, setToken] = useState('');
  const [botStatus, setBotStatus] = useState<BotStatus>({ state: 'offline', userTag: null, guildCount: 0, ping: null, lastError: null });
  const [aiModel, setAiModel] = useState('llama3.1');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.caya.getState().then(async initialState => {
      setState(initialState);
      document.documentElement.lang = initialState.locale;
      if (initialState.firstRun) {
        const defaultPath = await window.caya.getDefaultDataDirectory();
        setSelectedPath(defaultPath);
      }
    });
  }, []);

  useEffect(() => {
    if (!state || state.firstRun) return;

    let active = true;
    const refreshStatus = async () => {
      const [next, model, enabled] = await Promise.all([
        window.caya.getBotStatus(),
        window.caya.getSetting('ollama_chat_model'),
        window.caya.getSetting('ai_enabled')
      ]);
      if (active) {
        setBotStatus(next);
        setAiModel(model || 'llama3.1');
        setAiEnabled(enabled === 'true');
      }
    };

    void refreshStatus();
    const timer = window.setInterval(() => void refreshStatus(), 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [state?.firstRun]);

  const locale = state?.locale ?? 'en';
  const text = (key: TranslationKey) => t(locale, key);
  const botStateKey: TranslationKey = botStatus.state;
  const dashboardError = error ?? botStatus.lastError;

  const activeLabel = useMemo(
    () => navItems.find(item => item.id === activeSection)?.label ?? 'dashboard',
    [activeSection]
  );

  async function chooseFolder(useExisting: boolean) {
    const path = await window.caya.chooseDataDirectory();
    if (!path) return;
    setSelectedPath(path);
    if (useExisting) await initializeData(path, true);
  }

  async function initializeData(path: string, useExisting: boolean) {
    if (!path) return;
    setBusy(true);
    setError(null);
    try {
      await window.caya.initializeDataDirectory({ path, useExisting });
      const next = await window.caya.setLocale(locale);
      setState(next);
      document.documentElement.lang = next.locale;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function changeLocale(nextLocale: AppLocale) {
    if (state?.firstRun) {
      setState(current => current ? { ...current, locale: nextLocale } : current);
      document.documentElement.lang = nextLocale;
      return;
    }

    const next = await window.caya.setLocale(nextLocale);
    setState(next);
    document.documentElement.lang = nextLocale;
  }

  async function saveToken() {
    if (!token.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const next = await window.caya.setDiscordToken(token);
      setState(next);
      setToken('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function removeToken() {
    const next = await window.caya.clearDiscordToken();
    setState(next);
    setToken('');
  }

  async function startBot() {
    setBusy(true);
    setError(null);
    try {
      const next = await window.caya.startBot();
      setBotStatus(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function stopBot() {
    setBusy(true);
    setError(null);
    try {
      setBotStatus(await window.caya.stopBot());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  if (!state) {
    return <div className="boot-screen"><div className="boot-mark">C</div></div>;
  }

  if (state.firstRun) {
    return (
      <main className="setup-shell">
        <div className="setup-language">
          <LanguageSwitch locale={locale} onChange={changeLocale} />
        </div>
        <section className="setup-card">
          <div className="brand-mark large">C</div>
          <div className="eyebrow">CaYa Bot</div>
          <h1>{text('setupTitle')}</h1>
          <p className="setup-subtitle">{text('setupSubtitle')}</p>

          <div className="setup-options">
            <button className="setup-option selected" onClick={() => void window.caya.getDefaultDataDirectory().then(setSelectedPath)}>
              <span className="setup-icon"><DatabaseIcon size={22} /></span>
              <span><strong>{text('automatic')}</strong><small>{selectedPath}</small></span>
            </button>

            <button className="setup-option" onClick={() => void chooseFolder(false)}>
              <span className="setup-icon"><FolderIcon size={22} /></span>
              <span><strong>{text('chooseFolder')}</strong><small>{text('setupHint')}</small></span>
            </button>

            <button className="setup-option" onClick={() => void chooseFolder(true)}>
              <span className="setup-icon"><DatabaseIcon size={22} /></span>
              <span><strong>{text('useExisting')}</strong><small>{text('existingHint')}</small></span>
            </button>
          </div>

          <div className="path-preview">
            <span>{text('selectedFolder')}</span>
            <code>{selectedPath}</code>
          </div>

          {error && <div className="error-banner">{error}</div>}

          <button className="primary-button" disabled={busy || !selectedPath} onClick={() => void initializeData(selectedPath, false)}>
            {text('continue')}
          </button>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">C</div>
          <div><strong>CaYa</strong><span>{text('appSubtitle')}</span></div>
        </div>

        <nav className="navigation">
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={activeSection === item.id ? 'nav-item active' : 'nav-item'}
                onClick={() => setActiveSection(item.id)}
              >
                <Icon size={19} />
                <span>{text(item.label)}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className={`status-dot ${botStatus.state}`} />
          <div><strong>{text('botStatus')}</strong><span>{text(botStateKey)}</span></div>
        </div>
      </aside>

      <main className="content-shell">
        <header className="topbar">
          <div>
            <span className="eyebrow">{text('controlCenter')}</span>
            <h1>{text(activeLabel)}</h1>
          </div>
          <LanguageSwitch locale={locale} onChange={changeLocale} />
        </header>

        {activeSection === 'dashboard' && (
          <section className="page-grid">
            <div className="hero-card full-width">
              <div>
                <span className="eyebrow">{text('overview')}</span>
                <h2>{text('welcome')}</h2>
                <div className="hero-actions">
                  {botStatus.state === 'online' || botStatus.state === 'connecting' ? (
                    <button className="secondary-button compact" disabled={busy} onClick={() => void stopBot()}>{text('stopBot')}</button>
                  ) : (
                    <button className="primary-button compact" disabled={busy || !state.hasDiscordToken} onClick={() => void startBot()}>{text('startBot')}</button>
                  )}
                  <span className={`connection-pill ${botStatus.state}`}>{text(botStateKey)}</span>
                </div>
                {dashboardError && <div className="error-banner dashboard-error"><strong>{text('lastError')}:</strong> {dashboardError}</div>}
              </div>
              <div className="hero-orbit"><div className="brand-mark large">C</div></div>
            </div>

            <StatusCard
              icon={<DashboardIcon size={22} />}
              title={text('botStatus')}
              value={text(botStateKey)}
              detail={botStatus.userTag ? `${text('connectedAccount')}: ${botStatus.userTag}` : text('noAccount')}
            />
            <StatusCard
              icon={<ServerIcon size={22} />}
              title={text('servers')}
              value={String(botStatus.guildCount)}
              detail={botStatus.state === 'online' ? text('serverHintOnline') : text('serverHintOffline')}
            />
            <StatusCard
              icon={<ServerIcon size={22} />}
              title={text('ping')}
              value={botStatus.ping === null ? '—' : `${botStatus.ping} ms`}
              detail={text(botStateKey)}
            />
            <StatusCard icon={<DatabaseIcon size={22} />} title={text('localData')} value={text('databaseReady')} detail={text('dataHint')} />
            <StatusCard icon={<KeyIcon size={22} />} title={text('discordToken')} value={state.hasDiscordToken ? text('tokenStored') : text('tokenMissing')} detail={text('tokenSecurity')} />
            <StatusCard icon={<AiIcon size={22} />} title={text('ai')} value={aiEnabled ? (locale === 'tr' ? 'Açık' : 'Enabled') : (locale === 'tr' ? 'Kapalı' : 'Disabled')} detail={aiEnabled ? `${text('aiHint')} · ${aiModel}` : (locale === 'tr' ? 'Yapay zeka özellikleri kapalı' : 'AI features are disabled')} />
          </section>
        )}

        {activeSection === 'settings' && (
          <section className="settings-stack">
            <SettingsPanel title={text('language')} icon={<SettingsIcon size={20} />}>
              <LanguageSwitch locale={locale} onChange={changeLocale} expanded />
              <p className="panel-note">{text('systemLanguage')}: {state.systemLocale}</p>
            </SettingsPanel>

            <SettingsPanel title={text('dataStorage')} icon={<DatabaseIcon size={20} />}>
              <div className="readonly-path">{state.dataDirectory}</div>
            </SettingsPanel>

            <SettingsPanel title={text('discordToken')} icon={<KeyIcon size={20} />}>
              <div className="token-row">
                <input
                  type="password"
                  value={token}
                  onChange={event => setToken(event.target.value)}
                  placeholder={text('tokenPlaceholder')}
                  autoComplete="off"
                />
                <button className="primary-button compact" disabled={busy || !token.trim()} onClick={() => void saveToken()}>{text('saveToken')}</button>
                {state.hasDiscordToken && <button className="secondary-button compact" onClick={() => void removeToken()}>{text('removeToken')}</button>}
              </div>
              <p className="panel-note">{state.hasDiscordToken ? text('tokenStored') : text('tokenMissing')}</p>
              <p className="panel-note">{text('tokenSecurity')}</p>
              {error && <div className="error-banner">{error}</div>}
            </SettingsPanel>
          </section>
        )}

        {activeSection === 'servers' && <ServersModule locale={locale} />}
        {activeSection === 'music' && <MusicModule locale={locale} />}
        {activeSection === 'games' && <GamesModule locale={locale} />}
        {activeSection === 'ai' && <AiModule locale={locale} />}
        {activeSection === 'autoReplies' && <AutoRepliesModule locale={locale} />}
        {activeSection === 'moderation' && <ModerationModule locale={locale} />}
        {activeSection === 'whitelist' && <WhitelistModule locale={locale} />}
        {activeSection === 'blacklist' && <BlacklistModule locale={locale} />}
        {activeSection === 'logs' && <LogsModule locale={locale} />}
      </main>
    </div>
  );
}

function LanguageSwitch({ locale, onChange, expanded = false }: { locale: AppLocale; onChange: (locale: AppLocale) => void | Promise<void>; expanded?: boolean }) {
  return (
    <div className={expanded ? 'language-switch expanded' : 'language-switch'}>
      <button className={locale === 'en' ? 'active' : ''} onClick={() => void onChange('en')}>EN</button>
      <button className={locale === 'tr' ? 'active' : ''} onClick={() => void onChange('tr')}>TR</button>
    </div>
  );
}

function StatusCard({ icon, title, value, detail }: { icon: ReactNode; title: string; value: string; detail: string }) {
  return (
    <article className="status-card">
      <div className="card-icon">{icon}</div>
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function SettingsPanel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="settings-panel">
      <header><span className="card-icon small">{icon}</span><h2>{title}</h2></header>
      {children}
    </section>
  );
}

function renderSectionIcon(section: Section): ReactNode {
  const found = navItems.find(item => item.id === section);
  const Icon = found?.icon ?? DashboardIcon;
  return <Icon size={34} />;
}
