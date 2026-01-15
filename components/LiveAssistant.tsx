
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { createBlob, decode, decodeAudioData } from '../services/audioUtils';

interface LiveAssistantProps {
  systemInstruction: string;
  isActive: boolean;
}

const LiveAssistant: React.FC<LiveAssistantProps> = ({ systemInstruction, isActive }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTranscript, setLastTranscript] = useState({ user: '', ai: '' });
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const stopSession = useCallback(() => {
    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch (e) {
        console.debug('Session close error (expected if already closed):', e);
      }
      sessionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
      outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  const startSession = useCallback(async () => {
    if (sessionRef.current || isConnecting) return;

    setIsConnecting(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = mediaStream;
      
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setIsConnecting(false);
            
            if (!audioContextRef.current || !streamRef.current) return;

            const source = audioContextRef.current.createMediaStreamSource(streamRef.current);
            const scriptProcessor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              if (sessionRef.current && isConnected) {
                sessionPromise.then(session => {
                  try {
                    session.sendRealtimeInput({ media: pcmBlob });
                  } catch (err) {
                    console.error("Error sending realtime input:", err);
                  }
                });
              }
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextRef.current.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.outputTranscription) {
              setLastTranscript(prev => ({ ...prev, ai: prev.ai + message.serverContent?.outputTranscription?.text }));
            } else if (message.serverContent?.inputTranscription) {
              setLastTranscript(prev => ({ ...prev, user: prev.user + message.serverContent?.inputTranscription?.text }));
            }

            if (message.serverContent?.turnComplete) {
              // Keep transcript briefly for UX then clear
              setTimeout(() => setLastTranscript({ user: '', ai: '' }), 5000);
            }

            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current) {
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              
              source.onended = () => activeSourcesRef.current.delete(source);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              activeSourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              activeSourcesRef.current.forEach(s => {
                try { s.stop(); } catch (e) {}
              });
              activeSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => {
            console.error('Live API Error:', e);
            setError('Connection issue. Retrying...');
            stopSession();
          },
          onclose: (e) => {
            setIsConnected(false);
            setIsConnecting(false);
            sessionRef.current = null;
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error(err);
      setError('Check microphone permissions.');
      setIsConnecting(false);
      stopSession();
    }
  }, [systemInstruction, stopSession, isConnecting]);

  useEffect(() => {
    if (isActive && !isConnected && !isConnecting) {
      startSession();
    } else if (!isActive && (isConnected || isConnecting)) {
      stopSession();
    }
    return () => {
      if (!isActive) stopSession();
    };
  }, [isActive, isConnected, isConnecting, startSession, stopSession]);

  return (
    <div className="flex flex-col items-center justify-center p-6 h-full space-y-8">
      <div className="text-center space-y-2 mb-4">
        <h2 className="text-3xl font-black text-emerald-400 tracking-tighter uppercase italic">LIVE VOICE TRANSLATION</h2>
        <p className="text-slate-500 text-xs font-bold tracking-[0.2em]">BILAL AI ASSIST POWERED</p>
      </div>

      <div className="relative">
        <div className={`w-52 h-52 rounded-full flex items-center justify-center transition-all duration-700 ${
          isConnected ? 'bg-emerald-600 scale-105 shadow-[0_0_80px_rgba(16,185,129,0.4)]' : 'bg-slate-900 border-2 border-slate-800'
        }`}>
          {isConnected ? (
            <div className="flex space-x-1.5 items-center">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div 
                  key={i}
                  className="w-2 bg-white rounded-full animate-bounce"
                  style={{ 
                    height: `${Math.random() * 40 + 20}px`,
                    animationDelay: `${i * 0.1}s`,
                    animationDuration: '0.6s'
                  }}
                ></div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <span className="text-5xl mb-2 grayscale">🗣️</span>
              <span className="text-[10px] text-slate-500 font-bold">READY</span>
            </div>
          )}
        </div>
        
        {isConnecting && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-60 h-60 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
          </div>
        )}
      </div>

      <div className="text-center space-y-3 px-4">
        <h3 className="text-xl font-bold">{isConnected ? 'Bi-Directional Mode' : isConnecting ? 'Initializing Translator...' : 'Instant Conversation'}</h3>
        <p className="text-slate-400 text-sm max-w-xs mx-auto leading-relaxed">
          {isConnected 
            ? 'I am listening in both languages. Speak naturally and I will translate instantly.' 
            : 'Experience seamless, real-time voice translation for your travels.'}
        </p>
      </div>

      {(lastTranscript.user || lastTranscript.ai) && (
        <div className="w-full max-w-md space-y-4 p-5 bg-slate-900/80 rounded-[2rem] border border-slate-800 shadow-2xl animate-in fade-in slide-in-from-bottom-5">
          {lastTranscript.user && (
            <div className="text-left">
              <p className="text-[10px] text-blue-400 uppercase font-bold tracking-widest mb-1">Detected Input</p>
              <p className="text-sm italic text-slate-200">{lastTranscript.user}</p>
            </div>
          )}
          {lastTranscript.ai && (
            <div className="text-right">
              <p className="text-[10px] text-emerald-400 uppercase font-bold tracking-widest mb-1">Bilal Translation</p>
              <p className="text-sm font-bold text-white">{lastTranscript.ai}</p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-6 py-3 rounded-2xl text-xs font-bold text-center animate-pulse">
          {error}
        </div>
      )}

      <button
        onClick={isConnected ? stopSession : startSession}
        className={`px-12 py-5 rounded-full font-black text-sm uppercase tracking-widest shadow-2xl transition-all active:scale-95 ${
          isConnected ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'
        }`}
      >
        {isConnected ? 'Stop Translator' : 'Start Translation'}
      </button>
    </div>
  );
};

export default LiveAssistant;
