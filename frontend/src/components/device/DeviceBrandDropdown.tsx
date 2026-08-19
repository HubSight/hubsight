import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';
import { BRAND_PRESETS } from '../../constants/devicePresets';

export interface DeviceBrandDropdownProps {
  selectedBrand: string;
  onSelectBrand: (brandId: string) => void;
}

export const DeviceBrandDropdown: React.FC<DeviceBrandDropdownProps> = ({
  selectedBrand,
  onSelectBrand
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  const filteredPresets = BRAND_PRESETS.filter(
    (b) =>
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.tag.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        Device Brand (Brand Preset)
      </label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="input-field w-full flex items-center justify-between text-left cursor-pointer bg-white hover:border-orange-300 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-bold uppercase tracking-wider shrink-0">
            {selectedPreset.tag}
          </span>
          <span className="font-medium text-slate-800 truncate">{selectedPreset.name}</span>
        </div>
        <ChevronDown
          size={18}
          className={`text-slate-400 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden flex flex-col max-h-80">
          {/* Search Box */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/70 sticky top-0 z-10">
            <div className="relative flex items-center">
              <Search size={15} className="absolute left-2.5 text-slate-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm hãng camera/thiết bị (Hikvision, Dahua, Ezviz, Tapo, Imou...)"
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* List of Presets */}
          <div className="overflow-y-auto py-1 divide-y divide-slate-50">
            {filteredPresets.length === 0 ? (
              <div className="px-4 py-4 text-center text-xs text-slate-400">
                Không tìm thấy thương hiệu phù hợp
              </div>
            ) : (
              filteredPresets.map((b) => (
                <div
                  key={b.id}
                  onClick={() => {
                    onSelectBrand(b.id);
                    setIsOpen(false);
                  }}
                  className={`px-3.5 py-2 flex items-center justify-between cursor-pointer transition-colors ${
                    selectedBrand === b.id
                      ? 'bg-orange-50 text-orange-600 font-semibold'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                        selectedBrand === b.id
                          ? 'bg-orange-600 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {b.tag}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs truncate">{b.name}</div>
                      {b.hint && (
                        <div className="text-[10px] text-slate-400 font-normal truncate">
                          {b.hint}
                        </div>
                      )}
                    </div>
                  </div>
                  {selectedBrand === b.id && (
                    <Check size={16} className="text-orange-600 shrink-0" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Backward compatibility alias
export const CameraBrandDropdown = DeviceBrandDropdown;
export type CameraBrandDropdownProps = DeviceBrandDropdownProps;
