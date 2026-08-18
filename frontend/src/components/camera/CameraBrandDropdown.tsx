import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { BRAND_PRESETS } from '../../constants/cameraPresets';

interface CameraBrandDropdownProps {
  selectedBrand: string;
  onSelectBrand: (brandId: string) => void;
}

export const CameraBrandDropdown: React.FC<CameraBrandDropdownProps> = ({
  selectedBrand,
  onSelectBrand
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedPreset =
    BRAND_PRESETS.find((b) => b.id === selectedBrand) || BRAND_PRESETS[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        Camera Brand (Brand Preset)
      </label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="input-field w-full flex items-center justify-between text-left cursor-pointer bg-white"
      >
        <div className="flex items-center gap-2.5">
          <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-bold uppercase tracking-wider">
            {selectedPreset.tag}
          </span>
          <span className="font-medium text-slate-800">{selectedPreset.name}</span>
        </div>
        <ChevronDown
          size={18}
          className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1.5 max-h-60 overflow-y-auto">
          {BRAND_PRESETS.map((b) => (
            <div
              key={b.id}
              onClick={() => {
                onSelectBrand(b.id);
                setIsOpen(false);
              }}
              className={`px-4 py-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                selectedBrand === b.id
                  ? 'bg-orange-50 text-orange-600 font-semibold'
                  : 'hover:bg-slate-50 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
                    selectedBrand === b.id
                      ? 'bg-orange-600 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {b.tag}
                </span>
                <span className="text-sm">{b.name}</span>
              </div>
              {selectedBrand === b.id && <Check size={16} className="text-orange-600" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
