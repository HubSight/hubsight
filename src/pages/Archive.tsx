import { useState, useEffect, useRef } from 'react';
import { Camera, Play, Pause, Square, Calendar as CalendarIcon, Rewind, FastForward } from 'lucide-react';
import axiosClient from '../api/axiosClient';
import dayjs from 'dayjs';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import TimelineControl from '../components/TimelineControl';

interface CameraItem {
  id: number;
  name: string;
  host: string;
}

interface Recording {
  id: number;
  camera_id: number;
  start_at: string;
  end_at: string;
  duration_seconds: number;
}

const Archive = () => {
  const [cameras, setCameras] = useState<CameraItem[]>([]);
  const [selectedCam, setSelectedCam] = useState<string>('');
  const [dateObj, setDateObj] = useState<Date>(new Date());
  
  const dateStr = dayjs(dateObj).format('YYYY-MM-DD');

  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [activeRecording, setActiveRecording] = useState<Recording | null>(null);
  
  const [loading, setLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const seekTargetRef = useRef<number | null>(null);

  // Fetch cameras on mount
  useEffect(() => {
    axiosClient.get('/cameras')
      .then(res => {
        setCameras(res.data);
        if (res.data.length > 0) {
          setSelectedCam(res.data[0].id.toString());
        }
      })
      .catch(console.error);
  }, []);

  // Fetch timeline when cam or date changes
  useEffect(() => {
    if (!selectedCam || !dateStr) return;
    
    setLoading(true);
    const from = dayjs(`${dateStr}T00:00:00Z`).toISOString();
    const to = dayjs(`${dateStr}T23:59:59Z`).toISOString();
    
    axiosClient.get(`/archive/timeline?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&camera_id=${selectedCam}`)
      .then(res => {
        setRecordings(res.data);
        if (res.data.length > 0 && !activeRecording) {
          setActiveRecording(res.data[0]);
        } else if (res.data.length === 0) {
          setActiveRecording(null);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedCam, dateStr, activeRecording]);

  const handleSeek = (rec: Recording, offsetSeconds: number) => {
    if (activeRecording?.id !== rec.id) {
      // Need to switch video source
      seekTargetRef.current = offsetSeconds;
      setActiveRecording(rec);
    } else {
      // Same video, just seek
      if (videoRef.current) {
        videoRef.current.currentTime = offsetSeconds;
        videoRef.current.play();
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current && seekTargetRef.current !== null) {
      videoRef.current.currentTime = seekTargetRef.current;
      videoRef.current.play();
      seekTargetRef.current = null;
    }
  };

  const handleSkip = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime += seconds;
    }
  };

  const formatTime = (isoString: string) => {
    return dayjs(isoString).format('HH:mm:ss');
  };

  const settingsContent = (
    <>
      <div className="mb-6">
        <label className="flex items-center gap-2 text-sm text-slate-600 font-medium mb-3"><Camera size={16}/> Select Camera</label>
        <select className="input-field w-full bg-slate-50 border-slate-200" value={selectedCam} onChange={e => setSelectedCam(e.target.value)} disabled={cameras.length === 0}>
          {cameras.length === 0 ? (
            <option value="">No cameras available</option>
          ) : (
            cameras.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))
          )}
        </select>
      </div>
      
      <div className="mb-6">
        <label className="flex items-center gap-2 text-sm text-slate-600 font-medium mb-3"><CalendarIcon size={16}/> Select Date</label>
        <div className={`glass-panel p-2 bg-slate-50 ${!selectedCam ? 'opacity-50 pointer-events-none' : ''}`}>
          <Calendar 
            onChange={(val) => setDateObj(val as Date)} 
            value={dateObj} 
            className="react-calendar" 
          />
        </div>
      </div>
      
      <div className="mt-auto pt-6 border-t border-slate-100">
        <label className="flex items-center gap-2 text-sm text-slate-600 font-medium mb-2">Recordings ({recordings.length})</label>
        {loading ? (
          <div className="text-slate-500 text-sm">Loading...</div>
        ) : recordings.length === 0 ? (
          <div className="text-slate-500 text-sm">No recordings found for this date.</div>
        ) : (
          <div className="text-orange-600 text-sm font-medium">Recordings available on timeline.</div>
        )}
      </div>
    </>
  );

  return (
    <div className="h-full bg-slate-50 flex flex-col lg:flex-row overflow-hidden">
      
      {/* Left Area (Main Content) */}
      <div className="flex-1 flex flex-col min-w-0 h-full lg:overflow-hidden relative">
        
        {/* Mobile: Scrollable container. Desktop: Static flex-col */}
        <div className="flex-1 flex flex-col h-full overflow-y-auto lg:overflow-hidden relative">
          
          {/* 1. Video Player - Sticky on mobile, fills remaining height on desktop */}
          <div className="sticky top-0 z-30 w-full bg-black aspect-video lg:aspect-auto lg:flex-1 lg:min-h-0 flex flex-col items-center justify-center shrink-0 lg:mt-4 lg:mx-4 lg:w-[calc(100%-2rem)] lg:rounded-xl shadow-sm overflow-hidden lg:border border-slate-200">
            {activeRecording ? (
              <video 
                ref={videoRef}
                src={`/api/archive/${activeRecording.id}/stream`} 
                controls 
                autoPlay 
                onLoadedMetadata={handleLoadedMetadata}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-400 gap-3">
                <Camera size={48} className="opacity-20" />
                <div className="text-lg">No recording selected</div>
              </div>
            )}
          </div>

          {/* Wrapper for items below video */}
          <div className="flex flex-col shrink-0">
            
            {/* 2. Controls */}
            <div className={`p-4 lg:px-6 lg:pt-4 lg:pb-2 shrink-0 ${!activeRecording ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="bg-white p-4 lg:p-5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm rounded-xl border border-slate-200 relative overflow-hidden">
                <div className="flex-1 flex justify-start w-full md:w-auto z-10">
                  <div className="w-full md:w-auto text-slate-700 font-mono bg-slate-50 px-4 py-2.5 rounded-lg border border-slate-200 text-center text-sm md:text-base tracking-wider font-medium">
                    {activeRecording ? `${formatTime(activeRecording.start_at)} - ${formatTime(activeRecording.end_at)}` : '00:00:00 - 00:00:00'}
                  </div>
                </div>

                <div className="flex items-center gap-2 md:gap-4 z-10">
                  <button onClick={() => handleSkip(-10)} className="p-3 text-slate-500 hover:text-orange-600 hover:bg-orange-50 rounded-full transition-all" title="Rewind 10s"><Rewind size={22} /></button>
                  <div className="flex items-center gap-1 bg-slate-50 p-1.5 rounded-full border border-slate-200">
                    <button onClick={() => videoRef.current?.play()} className="p-3 bg-orange-600 hover:bg-orange-500 text-white rounded-full transition-all shadow-sm" title="Play"><Play size={22} className="fill-current ml-0.5" /></button>
                    <button onClick={() => videoRef.current?.pause()} className="p-3 text-slate-600 hover:text-orange-600 hover:bg-white rounded-full transition-all" title="Pause"><Pause size={22} className="fill-current" /></button>
                    <button onClick={() => { if(videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0; } }} className="p-3 text-slate-600 hover:text-orange-600 hover:bg-white rounded-full transition-all" title="Stop"><Square size={20} className="fill-current" /></button>
                  </div>
                  <button onClick={() => handleSkip(10)} className="p-3 text-slate-500 hover:text-orange-600 hover:bg-orange-50 rounded-full transition-all" title="Forward 10s"><FastForward size={22} /></button>
                </div>

                <div className="flex-1 hidden md:block z-10"></div>
              </div>
            </div>

            {/* 3. Settings - MOBILE ONLY */}
            <div className="p-4 lg:hidden flex flex-col bg-white border-y border-slate-200 shadow-sm mt-2 mb-4">
              <h2 className="text-lg font-bold mb-4 text-slate-800">Archive Settings</h2>
              {settingsContent}
            </div>

            {/* 4. Timeline */}
            <div className={`p-4 lg:px-6 lg:pt-0 lg:pb-4 shrink-0 ${!selectedCam ? 'opacity-50 pointer-events-none' : ''}`}>
              <TimelineControl recordings={recordings} currentDate={dateStr} onSeek={handleSeek} />
            </div>
          </div>
        </div>
      </div>

      {/* Right Sidebar - DESKTOP ONLY */}
      <div className="hidden lg:flex w-[340px] border-l border-slate-200 bg-white p-6 overflow-y-auto shrink-0 shadow-sm z-10 flex-col">
        <h2 className="text-xl font-bold mb-6 text-slate-800">Archive Settings</h2>
        {settingsContent}
      </div>

    </div>
  );
};

export default Archive;
