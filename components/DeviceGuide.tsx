
import React, { useRef, useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';

interface DeviceGuideProps {
  targetLanguage: string;
}

const DeviceGuide: React.FC<DeviceGuideProps> = ({ targetLanguage }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [guideData, setGuideData] = useState<{title: string, steps: string[]} | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
        setStream(s);
      } catch (err) {
        console.error("Camera error:", err);
      }
    };
    startCamera();
    return () => stream?.getTracks().forEach(t => t.stop());
  }, []);

  const identifyDevice = async () => {
    if (!videoRef.current || !canvasRef.current || isIdentifying) return;

    setIsIdentifying(true);
    setGuideData(null);

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
              { text: `Identify this electronic device or smart gadget. Provide a simple, step-by-step installation/setup guide in ${targetLanguage}. 
              Return the response as a clear title followed by a bulleted list of 3-5 major steps.` }
            ]
          }
        ]
      });

      const text = response.text || "";
      const lines = text.split('\n').filter(l => l.trim() !== "");
      setGuideData({
        title: lines[0] || "Device Identified",
        steps: lines.slice(1).map(s => s.replace(/^[*-]\s*/, ''))
      });
    } catch (err) {
      console.error(err);
      setGuideData({ title: "Error", steps: ["Could not identify device. Please try a clearer angle."] });
    } finally {
      setIsIdentifying(false);
    }
  };

  return (
    <div className="relative h-full w-full bg-slate-950 overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover opacity-50"
      />

      <div className="absolute inset-0 p-6 flex flex-col justify-between pointer-events-none">
        <div className="pt-10">
          <h2 className="text-2xl font-bold text-white shadow-sm">Device Setup Assistant</h2>
          <p className="text-slate-300 text-sm">Point at your smartwatch or gadget to begin.</p>
        </div>

        <div className="space-y-4 pointer-events-auto pb-24">
          {guideData && (
            <div className="bg-slate-900/90 backdrop-blur-xl p-5 rounded-3xl border border-blue-500/30 shadow-2xl animate-in fade-in slide-in-from-bottom-5">
              <h3 className="text-blue-400 font-bold uppercase text-xs tracking-widest mb-3">{guideData.title}</h3>
              <div className="space-y-3">
                {guideData.steps.map((step, idx) => (
                  <div key={idx} className="flex items-start space-x-3">
                    <span className="bg-blue-600 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">{idx + 1}</span>
                    <p className="text-white text-sm leading-snug">{step}</p>
                  </div>
                ))}
              </div>
              <button 
                onClick={() => setGuideData(null)}
                className="mt-4 w-full py-2 bg-slate-800 rounded-xl text-xs text-slate-400 font-bold hover:text-white transition-colors"
              >
                Scan Another Device
              </button>
            </div>
          )}

          {!guideData && (
            <div className="flex justify-center">
              <button
                onClick={identifyDevice}
                disabled={isIdentifying}
                className="group relative flex items-center justify-center"
              >
                <div className={`absolute w-24 h-24 rounded-full animate-ping bg-blue-500/20 ${isIdentifying ? 'hidden' : ''}`}></div>
                <div className={`w-20 h-20 rounded-full border-4 border-white flex items-center justify-center transition-all active:scale-95 ${
                  isIdentifying ? 'bg-blue-600 cursor-wait' : 'bg-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.5)]'
                }`}>
                  {isIdentifying ? (
                    <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <span className="text-3xl">🔍</span>
                  )}
                </div>
              </button>
            </div>
          )}
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default DeviceGuide;
