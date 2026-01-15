
import React, { useRef, useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';

interface VisualScannerProps {
  targetLanguage: string;
}

const VisualScanner: React.FC<VisualScannerProps> = ({ targetLanguage }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [zoom, setZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(1);
  const [showFlash, setShowFlash] = useState(false);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
        setStream(s);

        // Check for zoom capabilities
        const track = s.getVideoTracks()[0];
        const capabilities = track.getCapabilities() as any;
        if (capabilities.zoom) {
          setMaxZoom(capabilities.zoom.max);
        }
      } catch (err) {
        console.error("Camera error:", err);
      }
    };
    startCamera();
    return () => stream?.getTracks().forEach(t => t.stop());
  }, []);

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

  const captureAndAnalyze = async () => {
    if (!videoRef.current || !canvasRef.current || isAnalyzing) return;

    // Visual feedback: Flash
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 150);

    setIsAnalyzing(true);
    setAnalysisResult(null);

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
              { text: `Identify any road signs, text, or situational hazards in this image. Translate all non-English text to ${targetLanguage}. Provide short, clear advice for a driver. Keep it under 50 words.` }
            ]
          }
        ]
      });
      setAnalysisResult(response.text || "No analysis available.");
    } catch (err) {
      console.error(err);
      setAnalysisResult("Failed to analyze image.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover opacity-80"
      />

      {/* Grid Overlay */}
      <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-20">
        <div className="border-r border-b border-white/50"></div>
        <div className="border-r border-b border-white/50"></div>
        <div className="border-b border-white/50"></div>
        <div className="border-r border-b border-white/50"></div>
        <div className="border-r border-b border-white/50"></div>
        <div className="border-b border-white/50"></div>
        <div className="border-r border-white/50"></div>
        <div className="border-r border-white/50"></div>
        <div></div>
      </div>

      {/* Flash Effect */}
      {showFlash && (
        <div className="absolute inset-0 bg-white z-50 animate-out fade-out duration-300"></div>
      )}
      
      {/* UI Overlay */}
      <div className="absolute inset-0 flex flex-col pointer-events-none">
        {/* Viewfinder brackets */}
        <div className="flex-1 flex items-center justify-center relative">
          <div className="w-72 h-72 border-2 border-white/20 rounded-3xl relative">
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-500 -mt-1 -ml-1 rounded-tl-lg shadow-[0_0_15px_rgba(16,185,129,0.5)]"></div>
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-500 -mt-1 -mr-1 rounded-tr-lg shadow-[0_0_15px_rgba(16,185,129,0.5)]"></div>
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-500 -mb-1 -ml-1 rounded-bl-lg shadow-[0_0_15px_rgba(16,185,129,0.5)]"></div>
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-500 -mb-1 -mr-1 rounded-br-lg shadow-[0_0_15px_rgba(16,185,129,0.5)]"></div>
            
            {/* Scanning Line Animation */}
            {isAnalyzing && (
              <div className="absolute inset-x-0 h-1 bg-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.8)] z-10 animate-[scan_2s_infinite]"></div>
            )}
          </div>
        </div>

        {/* Controls and Results Area */}
        <div className="p-6 pb-24 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-auto flex flex-col items-center">
          
          {/* Zoom Slider */}
          {maxZoom > 1 && (
            <div className="mb-6 w-full max-w-xs flex items-center space-x-3 bg-black/40 px-4 py-2 rounded-full border border-white/10">
              <span className="text-white/40 text-xs font-bold">1x</span>
              <input
                type="range"
                min="1"
                max={maxZoom}
                step="0.1"
                value={zoom}
                onChange={handleZoomChange}
                className="flex-1 accent-emerald-500"
              />
              <span className="text-white text-xs font-bold min-w-[30px]">{zoom.toFixed(1)}x</span>
            </div>
          )}

          {analysisResult && (
            <div className="mb-6 w-full max-w-md p-4 bg-emerald-600/90 backdrop-blur-md rounded-2xl shadow-2xl border border-emerald-400/50 animate-in slide-in-from-bottom-4">
              <div className="flex items-start space-x-3">
                <span className="text-xl">💡</span>
                <p className="text-white text-sm font-medium leading-relaxed">{analysisResult}</p>
              </div>
            </div>
          )}

          <div className="flex justify-center items-center">
            <button
              onClick={captureAndAnalyze}
              disabled={isAnalyzing}
              className={`w-20 h-20 rounded-full border-4 border-white flex items-center justify-center transition-all ${
                isAnalyzing ? 'scale-90 opacity-50 cursor-wait' : 'bg-white/10 hover:bg-white/20 active:scale-95 active:bg-white/30'
              }`}
            >
              {isAnalyzing ? (
                <div className="w-8 h-8 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <div className="w-14 h-14 bg-white rounded-full shadow-[0_0_20px_rgba(255,255,255,0.3)]"></div>
              )}
            </button>
          </div>
          <p className="text-center text-white/60 text-[10px] mt-4 uppercase tracking-[0.2em] font-bold">Bilal Vision • Snap to Analyze</p>
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <style>{`
        @keyframes scan {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default VisualScanner;
