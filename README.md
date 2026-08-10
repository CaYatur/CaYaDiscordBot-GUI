# CaYaDiscordBot-GUI

[Türkçe README](README.tr.md)

CaYaDiscordBot-GUI is a Windows desktop control center for running and managing a Discord bot without editing configuration files by hand. It combines Discord server management, moderation, music, games, local AI, web research and image workflows in a single Electron application.

## Highlights

- Secure Discord bot token storage using the operating system's protected storage APIs.
- Server overview, logs and runtime status from a desktop GUI.
- Moderation tools, whitelist/blacklist management, automatic replies and link protection.
- Music playback with managed `yt-dlp`, bundled FFmpeg, queue controls, real Opus bitrate changes, metadata/stream caching and voice-channel safety checks.
- Games category with Rock-Paper-Scissors, multiplayer Rock-Paper-Scissors and raffle commands.
- Local Ollama integration with independent model selection for normal chat, web-research answers, image-prompt rewriting and image analysis.
- Vision-capable Ollama model detection for image and GIF analysis.
- Optional ComfyUI image generation with selectable checkpoints.
- Web research with multiple fallback providers and source-aware answers.
- English and Turkish interface with automatic system-language detection and manual switching.
- Local SQLite persistence. User data stays outside the application package.

## Requirements

- Windows 10/11 x64 for the portable release.
- A Discord bot application and bot token from the Discord Developer Portal.
- Internet access for Discord and web-research features.
- Ollama only if you want local AI chat / research answering / vision analysis.
- ComfyUI only if you want image generation.

`yt-dlp` is downloaded into the application's local data directory when needed. FFmpeg is bundled with the desktop application.

## Quick start

1. Download `CaYa-Bot-1.0.0-Portable.exe` from the GitHub Releases page.
2. Run the portable application.
3. Choose the application data folder when prompted.
4. Open **Settings** and save your Discord bot token.
5. Configure any optional Ollama / ComfyUI settings you want to use.
6. Start the bot from the dashboard.

## Discord permissions and intents

Enable the intents required by the features you use in the Discord Developer Portal. The application uses guilds, guild messages, guild members, presences, voice states and message content for its supported bot features.

When inviting the bot, grant only the permissions needed for your server and enabled modules. Moderation actions require the corresponding Discord permissions.

## AI configuration

AI is disabled by default as a category on a fresh installation. You can enable it from the **AI** section and independently configure:

- Chat response model
- Web research response model
- Image prompt model
- Vision / image analysis model

The vision selector only lists local Ollama models that report vision capability. ComfyUI checkpoint selection is independent from Ollama model selection.

## Data and security

- Discord tokens are not stored in plaintext in the project source or repository.
- Saved bot tokens are protected using Electron `safeStorage` and are not returned to the renderer after being stored.
- SQLite databases, logs, environment files, local runtime tools, build outputs and release artifacts are ignored by Git.
- The renderer runs with `contextIsolation`, without Node.js integration, through a narrow preload API.

Never commit bot tokens, API keys, personal databases or runtime data to a repository. If a Discord bot token has ever been exposed publicly, rotate it from the Discord Developer Portal before using it again.

## Development

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

Create a Windows x64 portable build with:

```bash
npm run dist:win
```

The project uses Electron, React, TypeScript, Vite, discord.js, SQLite, `@discordjs/voice`, `prism-media`, `ffmpeg-static` and Sharp.

## Main modules

- Dashboard
- Servers
- Music
- Games
- AI
- Automatic Replies
- Moderation
- Whitelist
- Blacklist
- Logs
- Settings

## Version

Current release: **1.0.0**

## Notes

This project is designed as a local desktop application. Ollama and ComfyUI integrations connect to services configured by the user, commonly on localhost. Availability and output quality depend on the models and services installed on the user's machine.
