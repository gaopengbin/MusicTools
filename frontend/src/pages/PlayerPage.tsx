import { useState, useEffect, useRef } from 'react';
import { 
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Repeat, Shuffle, ChevronDown, Heart, Share2, MessageCircle,
  List
} from 'lucide-react';
import { musicApi, type MusicTrack } from '../api/index';

interface PlayerPageProps {
  track: MusicTrack;
  audioUrl: string;
  isPlaying: boolean;
  coverUrl?: string;
  playlist: MusicTrack[];
  currentIndex: number;
  onClose: () => void;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  audioRef: React.RefObject<HTMLAudioElement>;
  lyricsCache?: Record<string, string>;
  onLyricLoaded?: (id: string, lyric: string) => void;
}

export default function PlayerPage({
  track,
  audioUrl,
  isPlaying,
  coverUrl,
  playlist: _playlist,
  currentIndex: _currentIndex,
  onClose,
  onTogglePlay,
  onPrev,
  onNext,
  audioRef,
  lyricsCache = {},
  onLyricLoaded,
}: PlayerPageProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [parsedLyrics, setParsedLyrics] = useState<{time: number; text: string}[]>([]);
  const [currentLyricIndex, setCurrentLyricIndex] = useState(0);
  const lyricContainerRef = useRef<HTMLDivElement>(null);
  const [liked, setLiked] = useState(false);

  // 禁止body滚动
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // 加载歌词
  useEffect(() => {
    const lyricId = track.lyric_id;
    if (!lyricId) {
      setParsedLyrics([]);
      setCurrentLyricIndex(0);
      return;
    }
    
    // 检查缓存
    if (lyricsCache[lyricId]) {
      setParsedLyrics(parseLyric(lyricsCache[lyricId]));
      setCurrentLyricIndex(0);
      return;
    }
    
    // 加载歌词
    musicApi.getLyric(lyricId, track.source || 'netease')
      .then(res => {
        if (res.data.lyric) {
          setParsedLyrics(parseLyric(res.data.lyric));
          onLyricLoaded?.(lyricId, res.data.lyric);
        }
      })
      .catch(() => {});
    setCurrentLyricIndex(0);
  }, [track.lyric_id, lyricsCache, onLyricLoaded]);

  // 解析LRC歌词
  const parseLyric = (lrc: string): {time: number; text: string}[] => {
    const lines = lrc.split('\n');
    const result: {time: number; text: string}[] = [];
    
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;
    
    lines.forEach(line => {
      const matches = [...line.matchAll(timeRegex)];
      const text = line.replace(timeRegex, '').trim();
      
      if (text && matches.length > 0) {
        matches.forEach(match => {
          const minutes = parseInt(match[1]);
          const seconds = parseInt(match[2]);
          const ms = parseInt(match[3]);
          const time = minutes * 60 + seconds + ms / (match[3].length === 2 ? 100 : 1000);
          result.push({ time, text });
        });
      }
    });
    
    return result.sort((a, b) => a.time - b.time);
  };

  // 更新播放进度
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration || 0);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('durationchange', updateDuration);

    // 初始化
    setCurrentTime(audio.currentTime);
    setDuration(audio.duration || 0);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('durationchange', updateDuration);
    };
  }, [audioRef, audioUrl]);

  // 更新当前歌词索引
  useEffect(() => {
    if (parsedLyrics.length === 0) return;
    
    let index = 0;
    for (let i = 0; i < parsedLyrics.length; i++) {
      if (parsedLyrics[i].time <= currentTime) {
        index = i;
      } else {
        break;
      }
    }
    setCurrentLyricIndex(index);
  }, [currentTime, parsedLyrics]);

  // 滚动歌词到当前位置
  useEffect(() => {
    if (lyricContainerRef.current && parsedLyrics.length > 0) {
      const container = lyricContainerRef.current;
      const activeLyric = container.querySelector('.lyric-active');
      if (activeLyric) {
        activeLyric.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentLyricIndex]);

  // 进度条拖动
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
    setCurrentTime(time);
  };

  // 音量控制
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
    setIsMuted(vol === 0);
  };

  // 静音切换
  const toggleMute = () => {
    if (audioRef.current) {
      if (isMuted) {
        audioRef.current.volume = volume || 0.5;
        setIsMuted(false);
      } else {
        audioRef.current.volume = 0;
        setIsMuted(true);
      }
    }
  };

  // 格式化时间
  const formatTime = (time: number) => {
    if (!isFinite(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#1a1a1a] text-white animate-scale-in">
      {/* 背景模糊图片 */}
      {coverUrl && (
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-30 blur-[100px] scale-150"
          style={{ backgroundImage: `url(${coverUrl})` }}
        />
      )}
      <div className="absolute inset-0 bg-black/40" />
      
      {/* 头部 - 固定高度56px */}
      <header className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-6 h-14">
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition">
          <ChevronDown className="w-6 h-6" />
        </button>
        <div className="text-center">
          <p className="text-xs text-zinc-400">正在播放</p>
          <p className="text-sm font-medium truncate max-w-48">{track.album || '未知专辑'}</p>
        </div>
        <button className="p-2 hover:bg-white/10 rounded-full transition">
          <Share2 className="w-5 h-5" />
        </button>
      </header>

      {/* 底部控制区 - 固定高度120px */}
      <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/80 to-transparent px-8 pb-4 pt-4 h-[120px]">
        {/* 进度条 */}
        <div className="max-w-3xl mx-auto mb-4">
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-400 w-10 text-right font-mono">{formatTime(currentTime)}</span>
            <div className="flex-1 relative group">
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1 bg-zinc-700/50 rounded-full appearance-none cursor-pointer
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 
                         [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-red-500 
                         [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer
                         [&::-webkit-slider-thumb]:opacity-0 [&::-webkit-slider-thumb]:group-hover:opacity-100
                         [&::-webkit-slider-thumb]:transition-opacity"
                style={{
                  background: `linear-gradient(to right, #ec4899 ${(currentTime/duration)*100}%, rgba(63,63,70,0.5) ${(currentTime/duration)*100}%)`
                }}
              />
            </div>
            <span className="text-xs text-zinc-400 w-10 font-mono">{formatTime(duration)}</span>
          </div>
        </div>

        {/* 播放控制 */}
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          {/* 左侧操作 */}
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setLiked(!liked)}
              className={`p-2 rounded-full transition ${liked ? 'text-red-500' : 'text-zinc-400 hover:text-white'}`}
            >
              <Heart className={`w-5 h-5 ${liked ? 'fill-current' : ''}`} />
            </button>
            <button className="p-2 text-zinc-400 hover:text-white rounded-full transition">
              <MessageCircle className="w-5 h-5" />
            </button>
          </div>

          {/* 中间播放控制 */}
          <div className="flex items-center gap-4">
            <button className="p-2 text-zinc-400 hover:text-white transition">
              <Shuffle className="w-5 h-5" />
            </button>
            <button onClick={onPrev} className="p-2 text-white hover:scale-110 transition">
              <SkipBack className="w-6 h-6 fill-current" />
            </button>
            <button 
              onClick={onTogglePlay}
              className="w-12 h-12 bg-white text-[#1a1a1a] rounded-full hover:scale-105 transition flex items-center justify-center shadow-lg"
            >
              {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
            </button>
            <button onClick={onNext} className="p-2 text-white hover:scale-110 transition">
              <SkipForward className="w-6 h-6 fill-current" />
            </button>
            <button className="p-2 text-zinc-400 hover:text-white transition">
              <Repeat className="w-5 h-5" />
            </button>
          </div>

          {/* 右侧操作 */}
          <div className="flex items-center gap-2">
            <button className="p-2 text-zinc-400 hover:text-white rounded-full transition">
              <List className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-1 group">
              <button onClick={toggleMute} className="p-2 text-zinc-400 hover:text-white transition">
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-20 h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 
                         [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white 
                         [&::-webkit-slider-thumb]:rounded-full"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 主内容区 - 绝对定位，顶部56px，底部120px */}
      <div className="absolute top-14 bottom-[120px] left-0 right-0 z-10 flex px-8 lg:px-16">
        {/* 左侧 - 唱片机 */}
        <div className="flex-1 flex items-center justify-center">
          <div className="relative">
            {/* 唱针 */}
            <div 
              className={`absolute -top-2 left-1/2 ml-6 w-20 h-28 origin-top-left transition-transform duration-500 z-20 ${
                isPlaying ? 'rotate-0' : '-rotate-25'
              }`}
            >
              <svg viewBox="0 0 100 150" className="w-full h-full drop-shadow-lg">
                <defs>
                  <linearGradient id="needle" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#b8b8b8" />
                    <stop offset="50%" stopColor="#e8e8e8" />
                    <stop offset="100%" stopColor="#b8b8b8" />
                  </linearGradient>
                </defs>
                <circle cx="15" cy="15" r="15" fill="#333" />
                <circle cx="15" cy="15" r="10" fill="#555" />
                <circle cx="15" cy="15" r="5" fill="#777" />
                <rect x="12" y="15" width="6" height="90" fill="url(#needle)" />
                <rect x="8" y="100" width="14" height="25" rx="2" fill="#444" />
                <rect x="11" y="120" width="8" height="15" fill="#666" />
              </svg>
            </div>
            
            {/* 唱片底座 */}
            <div className="w-64 h-64 rounded-full bg-gradient-to-b from-zinc-800 to-zinc-900 p-2 shadow-2xl">
              <div 
                className={`w-full h-full rounded-full bg-zinc-900 ${
                  isPlaying ? 'animate-spin-slow' : ''
                }`}
                style={{ animationDuration: '15s' }}
              >
                <div className="w-full h-full rounded-full relative"
                     style={{
                       background: `repeating-radial-gradient(circle at center, 
                         #1a1a1a 0px, #1a1a1a 2px, 
                         #252525 2px, #252525 4px)`
                     }}>
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[55%] h-[55%] rounded-full overflow-hidden border-4 border-zinc-700 shadow-inner">
                    {coverUrl ? (
                      <img src={coverUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-red-900 to-red-950 flex items-center justify-center">
                        <div className="w-4 h-4 rounded-full bg-zinc-300" />
                      </div>
                    )}
                  </div>
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-zinc-400 shadow-lg" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 右侧 - 歌词，使用相对定位容器 */}
        <div className="flex-1 relative">
          {/* 歌曲信息 */}
          <div className="text-center py-4">
            <h2 className="text-2xl font-bold mb-1 truncate px-4">{track.name}</h2>
            <div className="flex items-center justify-center gap-4 text-sm text-zinc-400">
              <span>歌手：<span className="text-blue-400 hover:underline cursor-pointer">{track.artist}</span></span>
              {track.album && <span>专辑：<span className="text-blue-400 hover:underline cursor-pointer truncate max-w-32">{track.album}</span></span>}
            </div>
          </div>

          {/* 歌词区域 - 绝对定位填充剩余空间 */}
          <div 
            ref={lyricContainerRef}
            className="absolute top-20 bottom-0 left-0 right-0 overflow-y-auto px-4"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            <style>{`.lyric-scroll::-webkit-scrollbar { display: none; }`}</style>
            {parsedLyrics.length > 0 ? (
              <div className="space-y-3 py-24">
                {parsedLyrics.map((line, index) => (
                  <p
                    key={index}
                    className={`text-center transition-all duration-300 cursor-pointer hover:text-zinc-300 ${
                      index === currentLyricIndex 
                        ? 'lyric-active text-white text-lg font-semibold' 
                        : 'text-zinc-500 text-sm'
                    }`}
                    onClick={() => {
                      if (audioRef.current) {
                        audioRef.current.currentTime = line.time;
                      }
                    }}
                  >
                    {line.text}
                  </p>
                ))}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <p className="text-zinc-500">纯音乐，请欣赏</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CSS */}
      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 15s linear infinite;
        }
        .-rotate-25 {
          transform: rotate(-25deg);
        }
      `}</style>
    </div>
  );
}
