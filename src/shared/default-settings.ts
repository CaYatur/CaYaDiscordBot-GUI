import { AI_PROMPT_DEFAULTS, AI_PROMPT_SETTING_KEYS } from './ai-prompts.js';

export const GLOBAL_SETTING_DEFAULTS: Readonly<Record<string, string>> = {
  ai_enabled: 'false',
  ai_llm_enabled: 'true',
  ai_web_search: 'true',
  ai_image_enabled: 'false',
  ollama_url: 'http://127.0.0.1:11434',
  ollama_model: '',
  ollama_chat_model: '',
  ollama_web_model: '',
  ollama_image_prompt_model: '',
  ollama_vision_model: '',
  comfyui_url: 'http://127.0.0.1:8000',
  comfyui_model: '',
  yt_dlp_path: 'yt-dlp',
  [AI_PROMPT_SETTING_KEYS.assistantSystem]: AI_PROMPT_DEFAULTS.assistantSystem,
  [AI_PROMPT_SETTING_KEYS.assistantBehavior]: AI_PROMPT_DEFAULTS.assistantBehavior,
  [AI_PROMPT_SETTING_KEYS.webResearchContext]: AI_PROMPT_DEFAULTS.webResearchContext,
  [AI_PROMPT_SETTING_KEYS.visionAnalysis]: AI_PROMPT_DEFAULTS.visionAnalysis,
  [AI_PROMPT_SETTING_KEYS.imagePromptRewrite]: AI_PROMPT_DEFAULTS.imagePromptRewrite,
  [AI_PROMPT_SETTING_KEYS.imagePromptTemplate]: AI_PROMPT_DEFAULTS.imagePromptTemplate,
  [AI_PROMPT_SETTING_KEYS.imageNegativePrompt]: AI_PROMPT_DEFAULTS.imageNegativePrompt
};

export const GUILD_SETTING_DEFAULTS: Readonly<Record<string, string>> = {
  link_filter: 'false',
  music_bitrate: '96'
};
