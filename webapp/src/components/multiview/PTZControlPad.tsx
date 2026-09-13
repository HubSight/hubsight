import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
  Square,
  X,
  Compass,
  Loader2,
  Check,
} from '@/components/icons';
import { api } from '../../api/client';
import type { PresetItem } from '@hubsight/sdk';
import { useTranslation } from '../../i18n';

export interface PTZControlPadProps {
  cameraId: string;
  cameraName?: string;
  onClose?: () => void;
  className?: string;
}

export const PTZControlPad: React.FC<PTZControlPadProps> = ({
  cameraId,
  cameraName,
  onClose,
  className = '',
}) => {
  const { t } = useTranslation();
  const [presets, setPresets] = useState<PresetItem[]>([]);
  const [loadingPresets, setLoadingPresets] = useState(false);
  const [activeDir, setActiveDir] = useState<string | null>(null);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [savingPreset, setSavingPreset] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMovingRef = useRef(false);

  // Load presets on mount
  const fetchPresets = useCallback(async () => {
    if (!cameraId) return;
    setLoadingPresets(true);
    try {
      const list = await api.cameras.getPresets(cameraId);
      setPresets(list);
    } catch {
      // Camera may not support presets or ONVIF not available
    } finally {
      setLoadingPresets(false);
    }
  }, [cameraId]);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  // Movement dispatchers
  const startMove = useCallback(
    async (pan: number, tilt: number, zoom = 0, dirKey?: string) => {
      isMovingRef.current = true;
      if (dirKey) setActiveDir(dirKey);
      setError(null);
      try {
        await api.cameras.ptz(cameraId, {
          action: 'move',
          pan,
          tilt,
          zoom,
        });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'PTZ move failed');
      }
    },
    [cameraId],
  );

  const stopMove = useCallback(async () => {
    if (!isMovingRef.current && !activeDir) return;
    isMovingRef.current = false;
    setActiveDir(null);
    try {
      await api.cameras.ptz(cameraId, { action: 'stop' });
    } catch {
      // Ignore stop errors
    }
  }, [cameraId, activeDir]);

  // Preset handlers
  const handleGotoPreset = async (token: string) => {
    setError(null);
    try {
      await api.cameras.managePreset(cameraId, {
        action: 'goto',
        preset_token: token,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Goto preset failed');
    }
  };

  const handleSavePreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPresetName.trim()) return;
    setSavingPreset(true);
    setError(null);
    try {
      await api.cameras.managePreset(cameraId, {
        action: 'set',
        preset_name: newPresetName.trim(),
      });
      setNewPresetName('');
      setShowSavePreset(false);
      await fetchPresets();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save preset failed');
    } finally {
      setSavingPreset(false);
    }
  };

  return (
    <div
      className={`select-none bg-slate-900/95 border border-slate-700/80 shadow-2xl backdrop-blur-md rounded-2xl p-3.5 text-slate-200 w-72 transition-all ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2 mb-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <Compass size={14} className="text-orange-400 shrink-0" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-200 truncate">
            PTZ: {cameraName || cameraId}
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Error alert */}
      {error && (
        <div className="mb-2.5 p-1.5 rounded-lg bg-rose-950/70 border border-rose-800/80 text-[10px] text-rose-300 font-mono">
          {error}
        </div>
      )}

      {/* ── Directional D-Pad ── */}
      <div className="flex flex-col items-center justify-center my-1">
        <div className="grid grid-cols-3 gap-1.5 p-2 bg-slate-950/60 rounded-2xl border border-slate-800/80 shadow-inner">
          {/* Top-Left */}
          <button
            type="button"
            onMouseDown={() => startMove(-0.7, 0.7, 0, 'upleft')}
            onMouseUp={stopMove}
            onMouseLeave={stopMove}
            onTouchStart={() => startMove(-0.7, 0.7, 0, 'upleft')}
            onTouchEnd={stopMove}
            className={`w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 active:scale-95 transition-all cursor-pointer ${
              activeDir === 'upleft' ? 'bg-orange-600 text-white' : ''
            }`}
            title="Up-Left"
          >
            <span className="-rotate-45 block">
              <ChevronUp size={14} />
            </span>
          </button>

          {/* Up */}
          <button
            type="button"
            onMouseDown={() => startMove(0, 1, 0, 'up')}
            onMouseUp={stopMove}
            onMouseLeave={stopMove}
            onTouchStart={() => startMove(0, 1, 0, 'up')}
            onTouchEnd={stopMove}
            className={`w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 active:scale-95 transition-all cursor-pointer ${
              activeDir === 'up' ? 'bg-orange-600 text-white' : ''
            }`}
            title="Up"
          >
            <ChevronUp size={16} />
          </button>

          {/* Top-Right */}
          <button
            type="button"
            onMouseDown={() => startMove(0.7, 0.7, 0, 'upright')}
            onMouseUp={stopMove}
            onMouseLeave={stopMove}
            onTouchStart={() => startMove(0.7, 0.7, 0, 'upright')}
            onTouchEnd={stopMove}
            className={`w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 active:scale-95 transition-all cursor-pointer ${
              activeDir === 'upright' ? 'bg-orange-600 text-white' : ''
            }`}
            title="Up-Right"
          >
            <span className="rotate-45 block">
              <ChevronUp size={14} />
            </span>
          </button>

          {/* Left */}
          <button
            type="button"
            onMouseDown={() => startMove(-1, 0, 0, 'left')}
            onMouseUp={stopMove}
            onMouseLeave={stopMove}
            onTouchStart={() => startMove(-1, 0, 0, 'left')}
            onTouchEnd={stopMove}
            className={`w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 active:scale-95 transition-all cursor-pointer ${
              activeDir === 'left' ? 'bg-orange-600 text-white' : ''
            }`}
            title="Left"
          >
            <ChevronLeft size={16} />
          </button>

          {/* Center Stop */}
          <button
            type="button"
            onClick={stopMove}
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-800/80 hover:bg-rose-900/50 text-slate-300 hover:text-rose-400 border border-slate-700/60 active:scale-95 transition-all cursor-pointer"
            title="Stop Movement"
          >
            <Square size={12} fill="currentColor" />
          </button>

          {/* Right */}
          <button
            type="button"
            onMouseDown={() => startMove(1, 0, 0, 'right')}
            onMouseUp={stopMove}
            onMouseLeave={stopMove}
            onTouchStart={() => startMove(1, 0, 0, 'right')}
            onTouchEnd={stopMove}
            className={`w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 active:scale-95 transition-all cursor-pointer ${
              activeDir === 'right' ? 'bg-orange-600 text-white' : ''
            }`}
            title="Right"
          >
            <ChevronRight size={16} />
          </button>

          {/* Down-Left */}
          <button
            type="button"
            onMouseDown={() => startMove(-0.7, -0.7, 0, 'downleft')}
            onMouseUp={stopMove}
            onMouseLeave={stopMove}
            onTouchStart={() => startMove(-0.7, -0.7, 0, 'downleft')}
            onTouchEnd={stopMove}
            className={`w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 active:scale-95 transition-all cursor-pointer ${
              activeDir === 'downleft' ? 'bg-orange-600 text-white' : ''
            }`}
            title="Down-Left"
          >
            <span className="-rotate-45 block">
              <ChevronDown size={14} />
            </span>
          </button>

          {/* Down */}
          <button
            type="button"
            onMouseDown={() => startMove(0, -1, 0, 'down')}
            onMouseUp={stopMove}
            onMouseLeave={stopMove}
            onTouchStart={() => startMove(0, -1, 0, 'down')}
            onTouchEnd={stopMove}
            className={`w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 active:scale-95 transition-all cursor-pointer ${
              activeDir === 'down' ? 'bg-orange-600 text-white' : ''
            }`}
            title="Down"
          >
            <ChevronDown size={16} />
          </button>

          {/* Down-Right */}
          <button
            type="button"
            onMouseDown={() => startMove(0.7, -0.7, 0, 'downright')}
            onMouseUp={stopMove}
            onMouseLeave={stopMove}
            onTouchStart={() => startMove(0.7, -0.7, 0, 'downright')}
            onTouchEnd={stopMove}
            className={`w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 active:scale-95 transition-all cursor-pointer ${
              activeDir === 'downright' ? 'bg-orange-600 text-white' : ''
            }`}
            title="Down-Right"
          >
            <span className="rotate-45 block">
              <ChevronDown size={14} />
            </span>
          </button>
        </div>
      </div>

      {/* ── Zoom Controls ── */}
      <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-slate-800 text-xs">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
          Zoom
        </span>
        <div className="flex items-center gap-1 bg-slate-950/60 p-0.5 rounded-xl border border-slate-800">
          <button
            type="button"
            onMouseDown={() => startMove(0, 0, -1, 'zoomout')}
            onMouseUp={stopMove}
            onMouseLeave={stopMove}
            onTouchStart={() => startMove(0, 0, -1, 'zoomout')}
            onTouchEnd={stopMove}
            className={`px-3 py-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 active:scale-95 transition-all cursor-pointer flex items-center gap-1 ${
              activeDir === 'zoomout' ? 'bg-orange-600 text-white' : ''
            }`}
            title="Zoom Out (-)"
          >
            <Minus size={12} />
            <span className="text-[10px] font-mono">OUT</span>
          </button>
          <button
            type="button"
            onMouseDown={() => startMove(0, 0, 1, 'zoomin')}
            onMouseUp={stopMove}
            onMouseLeave={stopMove}
            onTouchStart={() => startMove(0, 0, 1, 'zoomin')}
            onTouchEnd={stopMove}
            className={`px-3 py-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 active:scale-95 transition-all cursor-pointer flex items-center gap-1 ${
              activeDir === 'zoomin' ? 'bg-orange-600 text-white' : ''
            }`}
            title="Zoom In (+)"
          >
            <Plus size={12} />
            <span className="text-[10px] font-mono">IN</span>
          </button>
        </div>
      </div>

      {/* ── Presets Section ── */}
      <div className="mt-3 pt-2.5 border-t border-slate-800">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
            Presets {loadingPresets && <Loader2 size={10} className="inline animate-spin ml-1" />}
          </span>
          <button
            type="button"
            onClick={() => setShowSavePreset(!showSavePreset)}
            className="text-[10px] text-orange-400 hover:text-orange-300 font-semibold cursor-pointer flex items-center gap-1"
          >
            <Plus size={10} />
            <span>{t('common.add') || 'Add'}</span>
          </button>
        </div>

        {/* Save Preset Form */}
        {showSavePreset && (
          <form onSubmit={handleSavePreset} className="flex gap-1.5 mb-2">
            <input
              type="text"
              placeholder="Preset Name"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              className="flex-1 px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-200 outline-none focus:border-orange-500"
              autoFocus
            />
            <button
              type="submit"
              disabled={savingPreset || !newPresetName.trim()}
              className="px-2.5 py-1 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              {savingPreset ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            </button>
          </form>
        )}

        {/* Presets List */}
        {presets.length > 0 ? (
          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-0.5">
            {presets.map((p) => (
              <button
                key={p.token}
                type="button"
                onClick={() => handleGotoPreset(p.token)}
                className="px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-[10px] font-medium text-slate-200 active:scale-95 transition-all cursor-pointer truncate max-w-[120px]"
                title={`Go to ${p.name || p.token}`}
              >
                {p.name || `Preset ${p.token}`}
              </button>
            ))}
          </div>
        ) : (
          <div className="text-[10px] text-slate-500 font-mono italic">
            No saved presets
          </div>
        )}
      </div>
    </div>
  );
};
