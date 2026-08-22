import React from 'react';
import { Camera, Video } from 'lucide-react';

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => {
  return (
    <div
      className={`animate-pulse bg-slate-200/80 rounded-md ${className}`}
      aria-hidden="true"
    />
  );
};

export const DeviceCardSkeleton: React.FC = () => {
  return (
    <div className="bg-white border border-slate-200/90 p-4 sm:p-5 shadow-sm flex flex-col justify-between rounded-xl">
      <div>
        <div className="flex justify-between items-start mb-3 gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <Skeleton className="w-3 h-3 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-5 w-3/4 rounded" />
              <Skeleton className="h-4 w-16 rounded" />
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Skeleton className="w-8 h-8 rounded-lg" />
            <Skeleton className="w-8 h-8 rounded-lg" />
          </div>
        </div>

        {/* Host RTSP Skeleton */}
        <Skeleton className="h-9 w-full rounded-lg mb-3" />

        {/* Tags Skeleton */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          <Skeleton className="h-5 w-24 rounded" />
          <Skeleton className="h-5 w-20 rounded" />
          <Skeleton className="h-5 w-28 rounded" />
        </div>
      </div>

      {/* Footer Skeleton */}
      <div className="pt-3 border-t border-slate-100 flex justify-between">
        <Skeleton className="h-4 w-28 rounded" />
        <Skeleton className="h-4 w-20 rounded" />
      </div>
    </div>
  );
};

export const DevicesSkeleton: React.FC = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 animate-fade-in">
      {Array.from({ length: 6 }).map((_, index) => (
        <DeviceCardSkeleton key={index} />
      ))}
    </div>
  );
};

export const PlaybackSkeleton: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col min-w-0 max-w-[1920px] mx-auto w-full animate-fade-in">
      {/* Video player placeholder */}
      <div className="w-full bg-slate-900 aspect-video flex flex-col items-center justify-center relative overflow-hidden border-b border-slate-800 lg:max-h-[75vh]">
        <div className="flex flex-col items-center gap-3 text-slate-600 animate-pulse">
          <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center text-slate-600">
            <Video size={28} />
          </div>
          <Skeleton className="h-4 w-36 bg-slate-800 rounded" />
        </div>
      </div>

      {/* Below player toolbar & timeline skeleton */}
      <div className="flex flex-col shrink-0 px-4 lg:px-6 mt-4 gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-40 rounded-xl" />
            <Skeleton className="h-9 w-32 rounded-xl" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-28 rounded-xl" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <Skeleton className="h-4 w-44 rounded" />
            <Skeleton className="h-4 w-28 rounded" />
          </div>
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
};

export const NvrMonitorSkeleton: React.FC = () => {
  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in">
      {/* 4 Stats Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col justify-between space-y-4"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="w-10 h-10 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-8 w-28 rounded" />
              <Skeleton className="h-3 w-40 rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Control Panel Skeleton */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48 rounded" />
            <Skeleton className="h-4 w-72 rounded" />
          </div>
          <Skeleton className="h-11 w-36 rounded-xl" />
        </div>
      </div>

      {/* Camera Streams Grid Skeleton */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-48 rounded" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div
              key={idx}
              className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3"
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Skeleton className="w-2.5 h-2.5 rounded-full" />
                  <Skeleton className="h-5 w-32 rounded" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-10 w-full rounded-lg" />
              <div className="flex justify-between pt-2 border-t border-slate-100">
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-4 w-20 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const AppLoadingSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] w-screen bg-slate-50 p-4">
      <div className="flex flex-col items-center gap-4 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-orange-600 flex items-center justify-center text-white shadow-xl shadow-orange-600/30 animate-pulse">
          <Camera size={32} />
        </div>
        <div className="text-center space-y-1.5">
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">HubSight</h1>
          <p className="text-xs text-slate-400 font-medium">Smart CCTV & NVR Management</p>
        </div>
        <div className="w-40 h-1.5 bg-slate-200 rounded-full overflow-hidden mt-3">
          <div className="h-full bg-orange-600 rounded-full animate-[shimmer_1.5s_infinite_linear] w-1/2" />
        </div>
      </div>
    </div>
  );
};
