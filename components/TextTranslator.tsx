
import React, { useState, useRef } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { decode, decodeAudioData, encode } from '../services/audioUtils';

interface TextTranslatorProps {
  targetLanguage: string;
  sourceLanguage: string;
}

const TextTranslator: React.FC<TextTranslatorProps> = ({ targetLanguage, sourceLanguage }) => {
  const [inputText, setInputText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(1);
  const [showFlash, setShowFlash] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const handleTranslate = async (textToTranslate: string = inputText) => {
    if (!textToTranslate.trim() || isTranslating) return;
    setIsTranslating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Translate the following text from ${sourceLanguage} to ${targetLanguage}. Return ONLY the translated text.\n\nText: ${textToTranslate}`,
      });
      setTranslatedText(response.text || "Translation failed.");
    } catch (err) {
      console.error(err);
      setTranslatedText("Error during translation.");
    } finally {
      setIsTranslating(false);
    }
  };

  const handleSpeak = async () => {
    if (!translatedText || isSpeaking) return;
    setIsSpeaking(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: translatedText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const audioBuffer = await decodeAudioData(decode(base64Audio), audioCtx, 24000, 1);
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.destination);
        source.onended = () => {
          setIsSpeaking(false);
          audioCtx.close();
        };
        source.start();
      } else {
        setIsSpeaking(false);
      }
    } catch (err) {
      console.error("TTS error:", err);
      setIsSpeaking(false);
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(audioStream);
        audioChunksRef.current = [];
        
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64Audio = (reader.result as string).split(',')[1];
            setIsTranslating(true);
            try {
              const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
              const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: [
                  { inlineData: { data: base64Audio, mimeType: 'audio/webm' } },
                  { text: "Transcribe the spoken audio. Return only the transcription text, nothing else." }
                ],
              });
              const transcription = response.text?.trim() || "";
              if (transcription) {
                setInputText(prev => prev ? `${prev} ${transcription}` : transcription);
              }
            } catch (err) {
              console.error("Transcription error:", err);
            } finally {
              setIsTranslating(false);
              audioStream.getTracks().forEach(track => track.stop());
            }
          };
        };

        recorder.start();
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
      } catch (err) {
        console.error("Microphone error:", err);
        alert("Could not access microphone.");
      }
    }
  };

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = s;
      }
      setStream(s);
      setShowCamera(true);

      const track = s.getVideoTracks()[0];
      const capabilities = track.getCapabilities() as any;
      if (capabilities.zoom) {
        setMaxZoom(capabilities.zoom.max);
      }
    } catch (err) {
      console.error("Camera error:", err);
      alert("Could not access camera.");
    }
  };

  const handleZoomChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setZoom(value);
    const track = stream?.getVideoTracks()[0];
    if (track) {
      try {
        await track.applyConstraints({ advanced: [{ zoom: value }] } as any);
      } catch (err) {
        console.warn("Zoom constraint failed", err);
      }
    }
  };

  const stopCamera = () => {
    stream?.getTracks().forEach(t => t.stop());
    setStream(null);
    setShowCamera(false);
    setZoom(1);
  };

  const captureImage = async () => {
    if (!videoRef.current || !canvasRef.current || isCapturing) return;
    
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 150);
    
    setIsCapturing(true);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx?.drawImage(video, 0, 0);

    const base64Image = canvas.toDataURL('image/jpeg').split(',')[1];

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            parts: [
              { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
              { text: `Analyze this image as Bilal AI Assist. Focus on identifying and translating ROAD SIGNS or SIGNAGE into ${targetLanguage}. Extract all relevant text accurately and explain what it means for a traveler.` }
            ]
          }
        ]
      });
      setTranslatedText(response.text || "No signage detected.");
      stopCamera();
    } catch (err) {
      console.error(err);
      alert("Failed to process image.");
    } finally {
      setIsCapturing(false);
    }
  };

  const clearInput = () => {
    setInputText('');
    setTranslatedText('');
  };

  if (showCamera) {
    return (
      <div className="relative h-full w-full bg-black flex flex-col">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Grid Overlay */}
        <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-20">
          <div className="border-r border-b border-white/40"></div>
          <div className="border-r border-b border-white/40"></div>
          <div className="border-b border-white/40"></div>
          <div className="border-r border-b border-white/40"></div>
          <div className="border-r border-b border-white/40"></div>
          <div className="border-b border-white/40"></div>
          <div className="border-r border-white/40"></div>
          <div className="border-r border-white/40"></div>
          <div></div>
        </div>

        {/* Flash */}
        {showFlash && (
          <div className="absolute inset-0 bg-white z-50 animate-out fade-out duration-300"></div>
        )}

        <div className="absolute inset-0 flex flex-col justify-between p-6 pointer-events-none">
          <button 
            onClick={stopCamera}
            className="self-start p-2 bg-black/50 rounded-full text-white pointer-events-auto border border-white/10"
          >
            ✕
          </button>
          
          <div className="flex flex-col items-center pb-24 space-y-6 pointer-events-auto">
             {/* Zoom control */}
             {maxZoom > 1 && (
                <div className="w-full max-w-xs flex items-center space-x-3 bg-black/60 px-4 py-2 rounded-full border border-white/10">
                  <span className="text-white/40 text-[10px] font-bold">1x</span>
                  <input
                    type="range"
                    min="1"
                    max={maxZoom}
                    step="0.1"
                    value={zoom}
                    onChange={handleZoomChange}
                    className="flex-1 accent-blue-500"
                  />
                  <span className="text-white text-[10px] font-bold">{zoom.toFixed(1)}x</span>
                </div>
             )}

             {isCapturing && (
               <div className="bg-emerald-600/90 text-white px-4 py-2 rounded-full text-xs font-bold animate-pulse shadow-lg flex items-center space-x-2">
                 <div className="w-2 h-2 bg-white rounded-full animate-ping"></div>
                 <span>TRANSLATING SIGNS...</span>
               </div>
             )}
             
             <div className="flex flex-col items-center space-y-4">
               <button
                 onClick={captureImage}
                 disabled={isCapturing}
                 className={`w-20 h-20 rounded-full border-4 border-white flex items-center justify-center transition-all ${
                   isCapturing ? 'opacity-50 scale-90' : 'bg-white/20 active:scale-95'
                 }`}
               >
                 <div className="w-14 h-14 bg-white rounded-full shadow-inner"></div>
               </button>
               <p className="text-white text-[10px] font-bold uppercase tracking-[0.2em] drop-shadow-lg text-center">Focus on Signs • Capture for Translation</p>
             </div>
          </div>
        </div>
        <canvas ref={canvasRef} className="hidden" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-6 space-y-6">
      <div className="flex items-center justify-between bg-slate-900 p-2 rounded-2xl border border-slate-800">
        <div className="flex-1 text-center py-2 px-4 rounded-xl bg-slate-800 font-medium">
          {sourceLanguage}
        </div>
        <div className="px-4 text-blue-500 font-bold">→</div>
        <div className="flex-1 text-center py-2 px-4 rounded-xl bg-slate-800 font-medium">
          {targetLanguage}
        </div>
      </div>

      <div className="flex-1 flex flex-col space-y-4">
        <div className="relative flex-[0.4]">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type text or use Bilal Vision..."
            className="w-full h-full bg-slate-900 border border-slate-800 rounded-2xl p-4 pr-14 text-lg resize-none focus:ring-2 ring-blue-500 outline-none placeholder:text-slate-600 shadow-inner"
          />
          
          {inputText && (
            <button
              onClick={clearInput}
              className="absolute top-4 right-4 p-2 bg-slate-800/50 hover:bg-slate-700 text-slate-400 rounded-full transition-colors active:scale-90"
              title="Clear text"
            >
              ✕
            </button>
          )}

          <div className="absolute bottom-4 right-4 flex flex-col space-y-2">
            <button
              onClick={toggleRecording}
              className={`p-3 rounded-full shadow-lg transition-all active:scale-90 ${
                isRecording ? 'bg-red-500 animate-pulse text-white' : 'bg-slate-700 text-white hover:bg-slate-600'
              }`}
              title={isRecording ? "Stop recording" : "Input via voice"}
            >
              <span className="text-xl">🎙️</span>
            </button>
            <button
              onClick={startCamera}
              className="p-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 active:scale-90 transition-all border border-blue-400"
              title="Input via camera"
            >
              <span className="text-xl">📷</span>
            </button>
          </div>
        </div>

        {translatedText && (
          <div className="flex-[0.6] bg-slate-800/50 border border-slate-700 rounded-2xl p-4 overflow-y-auto animate-in fade-in slide-in-from-top-2 relative shadow-lg">
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs text-blue-400 font-bold uppercase tracking-widest">Bilal Translation</p>
              <button
                onClick={handleSpeak}
                disabled={isSpeaking}
                className={`p-2 rounded-full bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 transition-colors ${isSpeaking ? 'animate-pulse' : ''}`}
                title="Read aloud"
              >
                {isSpeaking ? '🔊' : '🔉'}
              </button>
            </div>
            <p className="text-lg leading-relaxed text-slate-100">{translatedText}</p>
          </div>
        )}
      </div>

      <button
        onClick={() => handleTranslate()}
        disabled={!inputText.trim() || isTranslating || isRecording}
        className={`w-full py-4 rounded-2xl font-bold text-lg shadow-xl transition-all ${
          !inputText.trim() || isTranslating || isRecording
            ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
            : 'bg-blue-600 hover:bg-blue-700 active:scale-95 shadow-blue-900/40'
        }`}
      >
        {isTranslating ? 'Translating...' : 'Translate'}
      </button>
    </div>
  );
};

export default TextTranslator;
