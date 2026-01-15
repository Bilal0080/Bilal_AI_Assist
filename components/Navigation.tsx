
import React from 'react';
import { AppMode } from '../types';

interface NavigationProps {
  currentMode: AppMode;
  onModeChange: (mode: AppMode) => void;
}

const Navigation: React.FC<NavigationProps> = ({ currentMode, onModeChange }) => {
  const navItems = [
    { mode: AppMode.VOICE, label: 'Live Voice', icon: '🗣️' },
    { mode: AppMode.VISUAL, label: 'Visual', icon: '📷' },
    { mode: AppMode.MAP, label: 'Map', icon: '🗺️' },
    { mode: AppMode.TEXT_TRANSLATION, label: 'Text', icon: '📝' },
    { mode: AppMode.DEVICES, label: 'Guide', icon: '⌚' },
    { mode: AppMode.SETTINGS, label: 'Settings', icon: '⚙️' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/80 backdrop-blur-lg border-t border-slate-800 pb-safe safe-area-bottom z-50">
      <div className="flex justify-around items-center h-16 max-w-lg mx-auto overflow-x-auto no-scrollbar">
        {navItems.map((item) => (
          <button
            key={item.mode}
            onClick={() => onModeChange(item.mode)}
            className={`flex flex-col items-center justify-center min-w-[64px] h-full transition-colors ${
              currentMode === item.mode ? 'text-emerald-500' : 'text-slate-400'
            }`}
          >
            <span className="text-xl mb-1">{item.icon}</span>
            <span className="text-[10px] font-medium uppercase tracking-wider">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};

export default Navigation;
