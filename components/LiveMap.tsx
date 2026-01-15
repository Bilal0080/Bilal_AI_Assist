import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { encode } from '../services/audioUtils';
import L from 'leaflet';

interface LiveMapProps {
  targetLanguage: string;
}

interface SavedRoute {
  id: string;
  name: string;
  start: { lat: number; lng: number };
  end: { lat: number; lng: number };
  analysis: string;
  timestamp: number;
}

const LiveMap: React.FC<LiveMapProps> = ({ targetLanguage }) => {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [places, setPlaces] = useState<any[]>([]);
  const [webResults, setWebResults] = useState<any[]>([]);
  const [coords, setCoords] = useState<{lat: number, lng: number} | null>(null);

  // Routing State
  const [routeMode, setRouteMode] = useState(false);
  const [startPoint, setStartPoint] = useState<L.LatLng | null>(null);
  const [endPoint, setEndPoint] = useState<L.LatLng | null>(null);
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);

  // Load saved routes from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('bilal_saved_routes');
    if (stored) {
      try {
        setSavedRoutes(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse saved routes", e);
      }
    }
  }, []);

  // Save routes to localStorage when updated
  useEffect(() => {
    localStorage.setItem('bilal_saved_routes', JSON.stringify(savedRoutes));
  }, [savedRoutes]);

  // Initialize Map
  useEffect(() => {
    if (mapContainerRef.current && !mapInstanceRef.current) {
      const defaultPos: [number, number] = coords ? [coords.lat, coords.lng] : [0, 0];
      
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false
      }).setView(defaultPos, coords ? 14 : 2);

      // Deep Dark Midnight Layer
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      }).addTo(map);

      L.control.zoom({ position: 'topright' }).addTo(map);

      markersLayerRef.current = L.layerGroup().addTo(map);
      routeLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;

      setTimeout(() => map.invalidateSize(), 100);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Dedicated effect to handle routing visualization
  useEffect(() => {
    if (!mapInstanceRef.current || !routeLayerRef.current) return;
    
    routeLayerRef.current.clearLayers();

    if (startPoint) {
      const startIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div class="w-8 h-8 bg-emerald-500 border-2 border-slate-900 rounded-full flex items-center justify-center text-white font-bold shadow-2xl ring-4 ring-emerald-500/20">A</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });
      L.marker(startPoint, { icon: startIcon }).addTo(routeLayerRef.current);
    }

    if (endPoint) {
      const endIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div class="w-8 h-8 bg-rose-500 border-2 border-slate-900 rounded-full flex items-center justify-center text-white font-bold shadow-2xl ring-4 ring-rose-500/20">B</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });
      L.marker(endPoint, { icon: endIcon }).addTo(routeLayerRef.current);
    }

    if (startPoint && endPoint) {
      const poly = L.polyline([startPoint, endPoint], {
        color: '#10b981',
        weight: 4,
        dashArray: '10, 10',
        opacity: 0.8
      }).addTo(routeLayerRef.current);
      
      mapInstanceRef.current.fitBounds(poly.getBounds(), { padding: [50, 50] });
    }
  }, [startPoint, endPoint]);

  const onMapInteraction = (e: L.LeafletMouseEvent) => {
    if (!routeMode) return;
    
    if (!startPoint) {
      setStartPoint(e.latlng);
    } else if (!endPoint) {
      setEndPoint(e.latlng);
    } else {
      setStartPoint(e.latlng);
      setEndPoint(null);
    }
  };

  useEffect(() => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.off('click');
      mapInstanceRef.current.on('click', onMapInteraction);
    }
  }, [routeMode, startPoint, endPoint]);

  useEffect(() => {
    if (coords && mapInstanceRef.current && !startPoint) {
      mapInstanceRef.current.setView([coords.lat, coords.lng], 14);
      L.circleMarker([coords.lat, coords.lng], {
        radius: 8,
        fillColor: "#3b82f6",
        color: "#fff",
        weight: 3,
        opacity: 1,
        fillOpacity: 1,
        className: 'user-location-pulse'
      }).addTo(mapInstanceRef.current).bindPopup("<b class='text-slate-200'>Current Location</b>");
    }
  }, [coords]);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.warn("Location error:", err)
      );
    }
  }, []);

  const handleSearch = async (searchQuery: string = query) => {
    if (!searchQuery.trim() || isLoading) return;
    setIsLoading(true);
    setResponse(null);
    setPlaces([]);
    setWebResults([]);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Act as Bilal AI Assist. For: "${searchQuery}", provide map context and web insights. Target language: ${targetLanguage}.`,
        config: {
          tools: [{ googleMaps: {} }, { googleSearch: {} }],
          toolConfig: { retrievalConfig: { latLng: coords ? { latitude: coords.lat, longitude: coords.lng } : undefined } }
        },
      });
      setResponse(result.text || null);
      const chunks = result.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (chunks) {
        setPlaces(chunks.filter((c: any) => c.maps).map((c: any) => c.maps));
        setWebResults(chunks.filter((c: any) => c.web).map((c: any) => c.web));
      }
    } catch (err) { setResponse("Search failed."); } finally { setIsLoading(false); }
  };

  const generateRoute = async () => {
    if (!startPoint || !endPoint) return;
    setIsLoading(true);
    setResponse(null);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Act as Bilal AI Assist. I have selected two points on a map:
        Start (Point A): ${startPoint.lat}, ${startPoint.lng}
        End (Point B): ${endPoint.lat}, ${endPoint.lng}
        
        Please provide walking and driving directions between these two points. Describe the route, mention estimated times, and highlight significant landmarks or safety considerations along the way. Output language: ${targetLanguage}.`,
        config: {
          tools: [{ googleMaps: {} }, { googleSearch: {} }]
        },
      });
      setResponse(result.text || "Route generated.");
      setRouteMode(false);
    } catch (err) {
      setResponse("Could not calculate route.");
    } finally {
      setIsLoading(false);
    }
  };

  const saveCurrentRoute = () => {
    if (!startPoint || !endPoint || !response) return;
    
    const name = prompt("Enter a name for this route:", `Route to ${endPoint.lat.toFixed(4)}, ${endPoint.lng.toFixed(4)}`);
    if (!name) return;

    const newRoute: SavedRoute = {
      id: Date.now().toString(),
      name,
      start: { lat: startPoint.lat, lng: startPoint.lng },
      end: { lat: endPoint.lat, lng: endPoint.lng },
      analysis: response,
      timestamp: Date.now()
    };

    setSavedRoutes(prev => [newRoute, ...prev]);
  };

  const loadSavedRoute = (route: SavedRoute) => {
    setStartPoint(new L.LatLng(route.start.lat, route.start.lng));
    setEndPoint(new L.LatLng(route.end.lat, route.end.lng));
    setResponse(route.analysis);
    setRouteMode(false);
    
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([route.start.lat, route.start.lng], 14);
    }
  };

  const deleteSavedRoute = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSavedRoutes(prev => prev.filter(r => r.id !== id));
  };

  const clearRoute = () => {
    setStartPoint(null);
    setEndPoint(null);
    setResponse(null);
  };

  return (
    <div className="flex flex-col h-full space-y-0 pb-20">
      {/* Map Section */}
      <div className="relative h-[45vh] w-full shrink-0 shadow-2xl z-0 overflow-hidden bg-slate-950">
        <div ref={mapContainerRef} className="h-full w-full" />
        
        {/* Status Badge */}
        <div className="absolute top-4 left-4 z-[400] bg-slate-950/80 backdrop-blur-md px-4 py-2 rounded-2xl border border-slate-800 shadow-lg pointer-events-none">
          <h2 className="text-[10px] font-bold text-emerald-400 flex items-center tracking-[0.2em]">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse mr-2"></span>
            {routeMode ? 'ROUTING ACTIVE' : 'RADAR ACTIVE'}
          </h2>
        </div>

        {/* Floating Controls */}
        <div className="absolute top-4 right-4 z-[400] flex flex-col space-y-2">
           <button 
             onClick={() => {
               setRouteMode(!routeMode);
               if(!routeMode) setResponse("Tap on the map to set Start (A) and End (B) points.");
             }}
             className={`p-3 rounded-2xl shadow-xl border transition-all active:scale-90 ${
               routeMode ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-slate-900/80 backdrop-blur-md border-slate-800 text-slate-400'
             }`}
           >
             <span className="text-xl">🛤️</span>
           </button>
        </div>

        {/* Route Instructions Overlay */}
        {routeMode && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[400] w-[80%] max-w-xs animate-in fade-in slide-in-from-top-4">
             <div className="bg-slate-900/90 backdrop-blur-md border border-emerald-500/30 p-3 rounded-2xl shadow-2xl text-center">
                <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1">
                  {!startPoint ? 'Step 1: Set Origin' : !endPoint ? 'Step 2: Set Destination' : 'Step 3: Calculate'}
                </p>
                <p className="text-xs text-white">
                  {!startPoint ? 'Tap where you are starting' : !endPoint ? 'Tap your destination' : 'Ready to analyze path'}
                </p>
             </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="absolute bottom-12 left-0 right-0 z-[400] flex justify-center space-x-3 px-4">
          {routeMode && (startPoint || endPoint) && (
            <button
              onClick={clearRoute}
              className="bg-slate-900/90 backdrop-blur-md border border-slate-800 text-slate-400 px-6 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider shadow-xl active:scale-95"
            >
              Clear
            </button>
          )}
          
          {startPoint && endPoint && routeMode ? (
            <button
              onClick={generateRoute}
              disabled={isLoading}
              className="bg-emerald-600 border border-emerald-400 text-white px-8 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider shadow-[0_8px_30px_rgb(16,185,129,0.3)] active:scale-95 animate-in zoom-in-95"
            >
              {isLoading ? 'Calculating...' : 'Generate Route'}
            </button>
          ) : !routeMode && (
            <button
              onClick={() => handleSearch("Popular landmarks and trending spots nearby")}
              disabled={isLoading}
              className="bg-gradient-to-br from-emerald-500 to-blue-600 p-1 rounded-2xl shadow-2xl transition-all hover:scale-105 active:scale-95"
            >
              <div className="bg-slate-950 rounded-[14px] px-6 py-3 flex items-center space-x-3">
                <span className="text-xl">🔭</span>
                <span className="text-xs font-bold text-white uppercase tracking-wider">Explore Nearby</span>
              </div>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col p-6 space-y-6 overflow-y-auto no-scrollbar bg-slate-950 z-10 rounded-t-[2.5rem] -mt-8 border-t border-slate-800/50 shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
        <div className="w-12 h-1.5 bg-slate-800 rounded-full mx-auto mb-2 opacity-50 shrink-0"></div>
        
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-white tracking-tight">Bilal Intelligence</h2>
          <p className="text-slate-500 text-xs italic">Route analysis and discovery.</p>
        </div>

        {/* Results Area */}
        {(response || webResults.length > 0 || places.length > 0) && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            {response && (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                   <div className="flex items-center space-x-2">
                     <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                     <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">
                       {startPoint && endPoint ? 'Route Analysis' : 'Intelligence Engine'}
                     </p>
                   </div>
                   <div className="flex items-center space-x-3">
                     {startPoint && endPoint && (
                       <button 
                         onClick={saveCurrentRoute} 
                         className="text-[10px] text-emerald-400 uppercase font-bold hover:text-white transition-colors flex items-center"
                       >
                         <span className="mr-1">💾</span> Save Route
                       </button>
                     )}
                     <button onClick={clearRoute} className="text-[10px] text-slate-500 uppercase font-bold hover:text-white transition-colors">Dismiss</button>
                   </div>
                </div>
                <div className="prose prose-invert max-w-none bg-slate-900/40 p-5 rounded-3xl border border-slate-800/40 shadow-inner">
                  <p className="text-slate-300 leading-relaxed whitespace-pre-wrap text-sm">{response}</p>
                </div>
              </div>
            )}

            {places.length > 0 && !routeMode && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest px-1">📍 Landmarks</h3>
                <div className="grid gap-3">
                  {places.map((place, idx) => (
                    <a key={idx} href={place.uri} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-4 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-2xl transition-all group">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center text-lg">🚩</div>
                        <span className="font-semibold text-slate-200 text-sm">{place.title}</span>
                      </div>
                      <span className="text-blue-500 text-[10px] font-bold">VIEW</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Saved Routes Section */}
        {savedRoutes.length > 0 && (
          <div className="space-y-4 pt-4 border-t border-slate-800/50">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1 flex items-center">
              <span className="mr-2">📁</span> Saved Journeys
            </h3>
            <div className="grid gap-3">
              {savedRoutes.map((route) => (
                <div 
                  key={route.id} 
                  onClick={() => loadSavedRoute(route)}
                  className="p-4 bg-slate-900/50 border border-slate-800 rounded-2xl hover:bg-slate-800 transition-all cursor-pointer group flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3 overflow-hidden">
                    <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center text-lg">🗺️</div>
                    <div className="overflow-hidden">
                      <p className="text-sm font-bold text-slate-200 truncate">{route.name}</p>
                      <p className="text-[10px] text-slate-500">{new Date(route.timestamp).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <button 
                    onClick={(e) => deleteSavedRoute(route.id, e)}
                    className="p-2 text-slate-600 hover:text-rose-500 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!response && !isLoading && !routeMode && savedRoutes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 opacity-30 text-center animate-pulse">
             <div className="text-7xl mb-6 grayscale">🌍</div>
             <p className="text-xs font-bold uppercase tracking-[0.4em] text-emerald-400">Knowledge Unlocked</p>
             <p className="text-[10px] text-slate-500 mt-2">Discover locations or plan a route</p>
          </div>
        )}
        
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
             <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
             <p className="text-emerald-500 text-[10px] font-bold uppercase tracking-widest animate-pulse text-center">Synthesizing intelligence...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveMap;