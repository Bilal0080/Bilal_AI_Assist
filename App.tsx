
import React, { useState, useEffect } from 'react';
import { AppMode, LANGUAGES, Language } from './types';
import Navigation from './components/Navigation';
import LiveAssistant from './components/LiveAssistant';
import VisualScanner from './components/VisualScanner';
import DeviceGuide from './components/DeviceGuide';
import TextTranslator from './components/TextTranslator';
import LiveMap from './components/LiveMap';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.VOICE);
  const [targetLang, setTargetLang] = useState<Language>(LANGUAGES[0]); // English
  const [sourceLang, setSourceLang] = useState<Language>(LANGUAGES[2]); // Spanish (better default for translation demo)
  const [location, setLocation] = useState<GeolocationPosition | null>(null);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation(pos),
        (err) => console.warn("Location access denied", err)
      );
    }
  }, []);

  const systemInstruction = `
    You are Bilal AI Assist, specialized in REAL-TIME VOICE TRANSLATION.
    
    Primary Task: Translate speech instantly between ${sourceLang.name} and ${targetLang.name}.
    
    CRITICAL PROTOCOL:
    1. When you hear ${sourceLang.name}, translate it immediately to ${targetLang.name}.
    2. When you hear ${targetLang.name}, translate it immediately to ${sourceLang.name}.
    3. Speak the translation clearly using the AUDIO modality.
    4. Keep translations natural and contextually accurate for travelers.
    5. If the user asks a question about their surroundings (Location: ${location ? `Lat ${location.coords.latitude}, Lng ${location.coords.longitude}` : 'Unknown'}), provide a brief, helpful answer in ${targetLang.name}.
    
    Tone: Professional, helpful, and efficient.
  `;

  const renderContent = () => {
    switch (mode) {
      case AppMode.VOICE:
        return <LiveAssistant isActive={mode === AppMode.VOICE} systemInstruction={systemInstruction} />;
      case AppMode.VISUAL:
        return <VisualScanner targetLanguage={targetLang.name} />;
      case AppMode.MAP:
        return <LiveMap targetLanguage={targetLang.name} />;
      case AppMode.DEVICES:
        return <DeviceGuide targetLanguage={targetLang.name} />;
      case AppMode.TEXT_TRANSLATION:
        return <TextTranslator targetLanguage={targetLang.name} sourceLanguage={sourceLang.name} />;
      case AppMode.SETTINGS:
        return (
          <div className="p-8 space-y-8 pb-32">
            <h2 className="text-3xl font-bold">Preferences</h2>
            
            <section className="space-y-4">
              <label className="block text-sm font-semibold text-slate-400 uppercase tracking-wider">Your Native Language (Output)</label>
              <div className="grid grid-cols-2 gap-3">
                {LANGUAGES.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => setTargetLang(lang)}
                    className={`flex items-center space-x-3 p-4 rounded-xl border transition-all ${
                      targetLang.code === lang.code ? 'bg-emerald-600 border-emerald-400 shadow-lg' : 'bg-slate-800 border-slate-700 opacity-60'
                    }`}
                  >
                    <span className="text-2xl">{lang.flag}</span>
                    <span className="font-medium">{lang.name}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-4">
              <label className="block text-sm font-semibold text-slate-400 uppercase tracking-wider">Foreign Language (Input)</label>
              <select 
                value={sourceLang.code}
                onChange={(e) => setSourceLang(LANGUAGES.find(l => l.code === e.target.value) || LANGUAGES[1])}
                className="w-full bg-slate-800 border border-slate-700 p-4 rounded-xl text-lg outline-none focus:ring-2 ring-emerald-500"
              >
                {LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.code}>{lang.flag} {lang.name}</option>
                ))}
              </select>
            </section>

            <section className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700">
              <h3 className="font-bold mb-2">Voice Translation Mode</h3>
              <p className="text-xs text-slate-400 mb-4">Uses the Live API for near-instant speech-to-speech translation.</p>
              <div className="flex items-center justify-between">
                <span>Ambient Noise Reduction</span>
                <div className="w-12 h-6 bg-emerald-600 rounded-full flex items-center px-1">
                  <div className="w-4 h-4 bg-white rounded-full ml-auto"></div>
                </div>
              </div>
            </section>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-50 overflow-hidden">
      {/* Header */}
      <header className="p-4 pt-8 flex items-center justify-between z-10">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center font-bold text-white shadow-lg">B</div>
          <h1 className="text-xl font-bold tracking-tight italic">Bilal AI Assist</h1>
        </div>
        <div className="flex items-center bg-slate-800/80 px-3 py-1.5 rounded-full space-x-2 border border-slate-700">
          <span className="text-xs font-semibold text-slate-400">Mode:</span>
          <span className="text-sm font-bold flex items-center space-x-1">
            <span>{sourceLang.flag}</span>
            <span className="text-slate-500 mx-1">↔</span>
            <span>{targetLang.flag}</span>
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative">
        {renderContent()}
      </main>

      {/* Persistent Navigation */}
      <Navigation currentMode={mode} onModeChange={setMode} />
    </div>
  );
};

export default App;
