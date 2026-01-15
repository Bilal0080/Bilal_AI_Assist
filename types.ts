
export enum AppMode {
  VOICE = 'VOICE',
  VISUAL = 'VISUAL',
  MAP = 'MAP',
  DEVICES = 'DEVICES',
  TEXT_TRANSLATION = 'TEXT_TRANSLATION',
  CHAT = 'CHAT',
  SETTINGS = 'SETTINGS'
}

export interface Language {
  code: string;
  name: string;
  flag: string;
}

export const LANGUAGES: Language[] = [
  { code: 'en-US', name: 'English', flag: '🇺🇸' },
  { code: 'ja-JP', name: 'Japanese', flag: '🇯🇵' },
  { code: 'es-ES', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr-FR', name: 'French', flag: '🇫🇷' },
  { code: 'zh-CN', name: 'Chinese', flag: '🇨🇳' },
  { code: 'de-DE', name: 'German', flag: '🇩🇪' },
  { code: 'it-IT', name: 'Italian', flag: '🇮🇹' },
  { code: 'ko-KR', name: 'Korean', flag: '🇰🇷' },
];

export interface TranscriptionItem {
  type: 'user' | 'ai';
  text: string;
  timestamp: number;
}
