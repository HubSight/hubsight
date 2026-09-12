import React, { useState, useMemo } from 'react';
import { MapPin, ExternalLink, Wifi, ShieldCheck } from '@/components/icons';
import { useTranslation } from '../../i18n';

interface StaticMapProps {
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  city?: string;
  country?: string;
  region?: string;
  zoom?: number;
  className?: string;
}

export const StaticMap: React.FC<StaticMapProps> = ({
  latitude,
  longitude,
  accuracy,
  city,
  country,
  region,
  zoom = 13,
  className = '',
}) => {
  const { t } = useTranslation();
  const [tileError, setTileError] = useState(false);

  const hasCoords =
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    !isNaN(latitude) &&
    !isNaN(longitude) &&
    (latitude !== 0 || longitude !== 0);

  // Convert (lat, lng, zoom) into OpenStreetMap Slippy Map tile indices & fractional pixel offset
  const tileInfo = useMemo(() => {
    if (!hasCoords || latitude === null || longitude === null || latitude === undefined || longitude === undefined) {
      return null;
    }

    const z = Math.min(18, Math.max(2, zoom));
    const n = Math.pow(2, z);

    const rawX = ((longitude + 180) / 360) * n;
    const centerTileX = Math.floor(rawX);
    const fracX = (rawX - centerTileX) * 256;

    const latRad = (latitude * Math.PI) / 180;
    const rawY =
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
    const centerTileY = Math.floor(rawY);
    const fracY = (rawY - centerTileY) * 256;

    // 3x3 grid around center tile (center is at offset index (1, 1))
    const tiles: { key: string; x: number; y: number; gridX: number; gridY: number }[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = (centerTileX + dx + n) % n;
        const ty = centerTileY + dy;
        if (ty >= 0 && ty < n) {
          tiles.push({
            key: `${z}-${tx}-${ty}`,
            x: tx,
            y: ty,
            gridX: dx + 1,
            gridY: dy + 1,
          });
        }
      }
    }

    // In a 768x768 container (3x3 of 256px), the exact marker point is at:
    // 256px (one tile width) + fracX, and 256px + fracY
    const markerTargetX = 256 + fracX;
    const markerTargetY = 256 + fracY;

    return {
      zoom: z,
      tiles,
      markerTargetX,
      markerTargetY,
    };
  }, [hasCoords, latitude, longitude, zoom]);

  const osmUrl = hasCoords
    ? `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=${zoom}/${latitude}/${longitude}`
    : '';

  // Location label resolution
  const locationLabel = useMemo(() => {
    const parts = [city, region, country].filter(Boolean);
    if (parts.length > 0) {
      return parts.join(', ');
    }
    return t('sessions.approxLocation');
  }, [city, region, country, t]);

  if (!hasCoords || !tileInfo) {
    // Elegant LAN / Local Network placeholder
    return (
      <div
        className={`relative overflow-hidden rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/50 flex flex-col items-center justify-center p-4 text-center select-none ${className}`}
      >
        {/* Subtle grid pattern background */}
        <div
          className="absolute inset-0 opacity-15 dark:opacity-20 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
            backgroundSize: '16px 16px',
          }}
        />

        <div className="relative z-10 flex flex-col items-center gap-1.5">
          <div className="w-8 h-8 rounded-lg bg-slate-200/80 dark:bg-slate-700/80 flex items-center justify-center text-slate-500 dark:text-slate-400 shadow-2xs">
            <Wifi size={15} />
          </div>
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
            {locationLabel || t('sessions.lanLocation')}
          </span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
            {t('sessions.noCoordinates')}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-200 dark:bg-slate-900 shadow-xs group ${className}`}
    >
      {/* 3x3 Tile Grid Canvas centered precisely at the target GPS coordinate */}
      <div
        className="absolute pointer-events-none transition-transform duration-300"
        style={{
          width: '768px',
          height: '768px',
          left: '50%',
          top: '50%',
          transform: `translate(-${tileInfo.markerTargetX}px, -${tileInfo.markerTargetY}px)`,
        }}
      >
        {tileInfo.tiles.map((tile) => (
          <img
            key={tile.key}
            src={
              tileError
                ? `https://tile.openstreetmap.org/${tileInfo.zoom}/${tile.x}/${tile.y}.png`
                : `https://a.basemaps.cartocdn.com/rastertiles/voyager/${tileInfo.zoom}/${tile.x}/${tile.y}.png`
            }
            alt=""
            loading="lazy"
            onError={() => setTileError(true)}
            className="absolute select-none pointer-events-none"
            style={{
              width: '256px',
              height: '256px',
              left: `${tile.gridX * 256}px`,
              top: `${tile.gridY * 256}px`,
            }}
          />
        ))}
      </div>

      {/* Subtle vignette shadow */}
      <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_16px_rgba(0,0,0,0.2)] dark:shadow-[inset_0_0_20px_rgba(0,0,0,0.6)]" />

      {/* Center Marker Pin (positioned exactly at center of component) */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full pointer-events-none z-10 flex flex-col items-center">
        {/* Animated radar ripple */}
        <div className="absolute -bottom-1 w-6 h-6 rounded-full bg-orange-500/30 dark:bg-orange-400/40 animate-ping pointer-events-none" />
        <div className="absolute -bottom-1 w-3 h-3 rounded-full bg-orange-600/60 dark:bg-orange-500/60 pointer-events-none" />

        {/* Pin icon */}
        <div className="w-7 h-7 rounded-full bg-orange-600 text-white flex items-center justify-center shadow-lg border-2 border-white dark:border-slate-900 transition-transform hover:scale-110">
          <MapPin size={14} className="fill-white" />
        </div>
      </div>

      {/* Overlay: City & Country Badge (Bottom Left) */}
      <div className="absolute bottom-2 left-2 right-12 z-20 pointer-events-none">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-700/80 shadow-xs max-w-full truncate">
          <ShieldCheck size={11} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate">
            {locationLabel}
          </span>
          {accuracy && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 font-mono">
              (±{Math.round(accuracy)}m)
            </span>
          )}
        </div>
      </div>

      {/* Action: Open in OpenStreetMap (Top Right) */}
      <a
        href={osmUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={t('sessions.openMap')}
        className="absolute top-2 right-2 z-20 w-7 h-7 rounded-md bg-white/90 dark:bg-slate-900/90 hover:bg-white dark:hover:bg-slate-800 backdrop-blur-md border border-slate-200/80 dark:border-slate-700/80 text-slate-600 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400 flex items-center justify-center shadow-xs transition-colors cursor-pointer"
      >
        <ExternalLink size={13} />
      </a>
    </div>
  );
};
