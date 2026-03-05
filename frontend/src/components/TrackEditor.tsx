import { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { ZoomIn, ZoomOut, Play, Pause, SkipBack, Plus, Trash2, Volume2, VolumeX } from 'lucide-react';

export interface Marker {
  id: string;
  time: number; // 秒
}

export interface Segment {
  id: string;
  start: number;
  end: number;
  originalText?: string;  // Suno 实际唱的
  targetText?: string;    // 正确的歌词
  fixedAudioUrl?: string; // 修复后的音频 URL
  isFixed?: boolean;
  useFixed?: boolean;     // 导出时是否使用修复后的音频
}

interface TrackEditorProps {
  audioUrl: string;
  markers: Marker[];
  onMarkersChange: (markers: Marker[]) => void;
  selectedSegmentId: string | null;
  onSegmentSelect: (segment: Segment | null) => void;
  segments: Segment[];
  onSegmentUpdate?: (segmentId: string, updates: Partial<Segment>) => void;
}

export default function TrackEditor({
  audioUrl,
  markers,
  onMarkersChange,
  selectedSegmentId,
  onSegmentSelect,
  segments,
  onSegmentUpdate,
}: TrackEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const fixedAudioRef = useRef<HTMLAudioElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [zoom, setZoom] = useState(50);
  const [isReady, setIsReady] = useState(false);
  
  // 轨道开关
  const [originalTrackEnabled, setOriginalTrackEnabled] = useState(true);
  const [fixedTrackEnabled, setFixedTrackEnabled] = useState(true);
  const [playingFixedSegmentId, setPlayingFixedSegmentId] = useState<string | null>(null);

  // 初始化 WaveSurfer
  useEffect(() => {
    if (!waveRef.current || !audioUrl) return;

    const ws = WaveSurfer.create({
      container: waveRef.current,
      waveColor: '#4a5568',
      progressColor: '#3b82f6',
      cursorColor: '#ef4444',
      cursorWidth: 2,
      height: 128,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      minPxPerSec: zoom,
    });

    ws.load(audioUrl);

    ws.on('ready', () => {
      setDuration(ws.getDuration());
      setIsReady(true);
    });

    ws.on('audioprocess', () => {
      setCurrentTime(ws.getCurrentTime());
    });

    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));

    ws.on('click', (relativeX) => {
      const clickTime = relativeX * ws.getDuration();
      setCurrentTime(clickTime);
    });

    wavesurferRef.current = ws;

    return () => {
      ws.destroy();
    };
  }, [audioUrl]);

  // 波形宽度 = 时长 * 每秒像素数
  const waveformWidth = duration * zoom;

  // 更新缩放
  useEffect(() => {
    if (wavesurferRef.current && isReady) {
      wavesurferRef.current.zoom(zoom);
    }
  }, [zoom, isReady]);

  // 获取当前时间所在的修复片段
  const getFixedSegmentAtTime = useCallback((time: number) => {
    return segments.find(seg => 
      seg.isFixed && 
      seg.useFixed !== false && 
      seg.fixedAudioUrl &&
      time >= seg.start && 
      time < seg.end
    );
  }, [segments]);

  // 智能播放 - 在修复片段切换音源
  useEffect(() => {
    if (!isPlaying || !fixedTrackEnabled) return;
    
    const checkInterval = setInterval(() => {
      if (!wavesurferRef.current) return;
      const time = wavesurferRef.current.getCurrentTime();
      const fixedSeg = getFixedSegmentAtTime(time);
      
      if (fixedSeg && !playingFixedSegmentId) {
        // 进入修复片段，播放修复音频
        if (originalTrackEnabled) {
          wavesurferRef.current.setVolume(0); // 静音原始轨道
        }
        if (fixedAudioRef.current && fixedSeg.fixedAudioUrl) {
          fixedAudioRef.current.src = fixedSeg.fixedAudioUrl;
          fixedAudioRef.current.currentTime = time - fixedSeg.start;
          fixedAudioRef.current.play();
          setPlayingFixedSegmentId(fixedSeg.id);
        }
      } else if (!fixedSeg && playingFixedSegmentId) {
        // 离开修复片段，恢复原始音频
        if (originalTrackEnabled) {
          wavesurferRef.current.setVolume(1);
        }
        if (fixedAudioRef.current) {
          fixedAudioRef.current.pause();
        }
        setPlayingFixedSegmentId(null);
      }
    }, 50);
    
    return () => clearInterval(checkInterval);
  }, [isPlaying, fixedTrackEnabled, originalTrackEnabled, getFixedSegmentAtTime, playingFixedSegmentId]);

  // 播放/暂停
  const togglePlay = () => {
    if (wavesurferRef.current) {
      if (isPlaying) {
        wavesurferRef.current.pause();
        fixedAudioRef.current?.pause();
        setPlayingFixedSegmentId(null);
      } else {
        wavesurferRef.current.setVolume(originalTrackEnabled ? 1 : 0);
        wavesurferRef.current.play();
      }
    }
  };

  // 切换原始轨道
  const toggleOriginalTrack = () => {
    const newEnabled = !originalTrackEnabled;
    setOriginalTrackEnabled(newEnabled);
    if (wavesurferRef.current && !playingFixedSegmentId) {
      wavesurferRef.current.setVolume(newEnabled ? 1 : 0);
    }
  };

  // 切换修复轨道
  const toggleFixedTrack = () => {
    const newEnabled = !fixedTrackEnabled;
    setFixedTrackEnabled(newEnabled);
    if (!newEnabled && fixedAudioRef.current) {
      fixedAudioRef.current.pause();
      setPlayingFixedSegmentId(null);
      if (wavesurferRef.current && originalTrackEnabled) {
        wavesurferRef.current.setVolume(1);
      }
    }
  };

  // 回到开头
  const seekToStart = () => {
    wavesurferRef.current?.seekTo(0);
    setCurrentTime(0);
  };

  // 在当前位置添加标记
  const addMarkerAtCurrent = () => {
    const time = wavesurferRef.current?.getCurrentTime() || 0;
    const newMarker: Marker = {
      id: `marker-${Date.now()}`,
      time,
    };
    // 按时间排序
    const newMarkers = [...markers, newMarker].sort((a, b) => a.time - b.time);
    onMarkersChange(newMarkers);
  };

  // 删除标记
  const deleteMarker = (id: string) => {
    onMarkersChange(markers.filter(m => m.id !== id));
  };

  // 格式化时间
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  // 点击片段
  const handleSegmentClick = (segment: Segment) => {
    onSegmentSelect(segment);
    // 跳转到片段开始位置
    if (wavesurferRef.current && duration > 0) {
      wavesurferRef.current.seekTo(segment.start / duration);
      setCurrentTime(segment.start);
    }
  };

  // 播放选中片段
  const playSegment = (segment: Segment) => {
    if (!wavesurferRef.current || duration === 0) return;
    
    wavesurferRef.current.seekTo(segment.start / duration);
    wavesurferRef.current.play();
    
    // 到达结束位置时暂停
    const checkEnd = setInterval(() => {
      if (wavesurferRef.current) {
        const current = wavesurferRef.current.getCurrentTime();
        if (current >= segment.end) {
          wavesurferRef.current.pause();
          clearInterval(checkEnd);
        }
      }
    }, 50);
  };

  // 处理滚动同步
  const handleScroll = () => {
    if (containerRef.current) {
      setScrollLeft(containerRef.current.scrollLeft);
    }
  };

  // 拖动标记
  const handleMarkerDrag = (markerId: string, _e: React.MouseEvent) => {
    if (!containerRef.current || !wavesurferRef.current) return;
    
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const currentScrollLeft = container.scrollLeft;
    
    const onMouseMove = (moveEvent: MouseEvent) => {
      const x = moveEvent.clientX - rect.left + currentScrollLeft;
      const totalWidth = waveformWidth;
      const newTime = Math.max(0, Math.min(duration, (x / totalWidth) * duration));
      
      const newMarkers = markers.map(m => 
        m.id === markerId ? { ...m, time: newTime } : m
      ).sort((a, b) => a.time - b.time);
      
      onMarkersChange(newMarkers);
    };
    
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div className="bg-white dark:bg-zinc-800 rounded-lg shadow p-4">
      {/* 控制栏 */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={seekToStart}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded"
            title="回到开头"
          >
            <SkipBack className="w-5 h-5" />
          </button>
          <button
            onClick={togglePlay}
            className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded"
            title={isPlaying ? '暂停' : '播放'}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
        </div>

        <div className="text-sm font-mono text-zinc-600 dark:text-zinc-400">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={addMarkerAtCurrent}
            className="flex items-center gap-1 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded text-sm"
            title="在当前位置添加分割点"
          >
            <Plus className="w-4 h-4" />
            添加分割点
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoom(Math.max(10, zoom - 20))}
            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded"
            title="缩小"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs text-zinc-500 w-12 text-center">{zoom}x</span>
          <button
            onClick={() => setZoom(Math.min(500, zoom + 20))}
            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded"
            title="放大"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 多音轨容器 - 统一滚动 */}
      <div className="relative border border-zinc-200 dark:border-zinc-700 rounded overflow-hidden">
        {/* 轨道标签和开关 */}
        <div className="absolute left-0 top-0 z-20 bg-white/90 dark:bg-zinc-800/90 text-xs px-2 py-1 rounded-br">
          <button 
            onClick={toggleOriginalTrack}
            className={`flex items-center gap-1 ${originalTrackEnabled ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-400'}`}
          >
            {originalTrackEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>原始
          </button>
          <button 
            onClick={toggleFixedTrack}
            className={`flex items-center gap-1 mt-1 ${fixedTrackEnabled ? 'text-green-600 dark:text-green-400' : 'text-zinc-400'}`}
          >
            {fixedTrackEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
            <span className="w-2 h-2 rounded-full bg-green-500"></span>修复
          </button>
        </div>

        {/* 滚动容器 */}
        <div 
          ref={containerRef}
          className="w-full overflow-x-auto"
          onScroll={handleScroll}
        >
          {/* 内容容器 */}
          <div style={{ width: waveformWidth || 'auto', minWidth: '100%' }}>
            {/* 原始音轨 - 波形 */}
            <div ref={waveRef} style={{ height: 128 }} />
            
            {/* 修复音轨 - 片段块 */}
            <div className="relative bg-zinc-100 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-700" style={{ height: 48 }}>
              {segments.map((segment, index) => {
                const left = duration > 0 ? (segment.start / duration) * waveformWidth : 0;
                const width = duration > 0 ? ((segment.end - segment.start) / duration) * waveformWidth : 0;
                const useFixed = segment.isFixed && segment.useFixed !== false;
                return (
                  <div
                    key={segment.id}
                    className={`absolute top-1 bottom-1 rounded cursor-pointer transition-colors group/seg ${
                      useFixed
                        ? 'bg-green-500/80 hover:bg-green-500' 
                        : segment.isFixed
                        ? 'bg-yellow-500/80 hover:bg-yellow-500'
                        : 'bg-zinc-300 dark:bg-zinc-600 hover:bg-zinc-400 dark:hover:bg-zinc-500'
                    } ${
                      selectedSegmentId === segment.id ? 'ring-2 ring-blue-500' : ''
                    }`}
                    style={{ left, width: Math.max(width, 20) }}
                    onClick={() => handleSegmentClick(segment)}
                    title={`#${index + 1} ${formatTime(segment.start)} - ${formatTime(segment.end)}${segment.isFixed ? (useFixed ? ' [修复]' : ' [原始]') : ''}`}
                  >
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-white font-medium truncate px-1">
                      {segment.isFixed ? (useFixed ? '✓' : 'O') : index + 1}
                    </div>
                    {/* 切换按钮 - 已修复的片段才显示 */}
                    {segment.isFixed && onSegmentUpdate && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSegmentUpdate(segment.id, { useFixed: !useFixed });
                        }}
                        className="absolute -top-5 left-1/2 -translate-x-1/2 px-1 py-0.5 text-[10px] bg-zinc-800 text-white rounded opacity-0 group-hover/seg:opacity-100 transition-opacity whitespace-nowrap"
                        title={useFixed ? '切换为原始' : '切换为修复'}
                      >
                        {useFixed ? '→原始' : '→修复'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        
        {/* 标记层 - 覆盖在两条轨道上 */}
        {isReady && duration > 0 && waveformWidth > 0 && (
          <div 
            className="absolute top-0 left-0 pointer-events-none z-10"
            style={{ 
              width: waveformWidth,
              height: 128 + 48, // 波形高度 + 修复轨高度
              transform: `translateX(-${scrollLeft}px)`,
            }}
          >
            {markers.map((marker) => (
              <div
                key={marker.id}
                className="absolute top-0 h-full w-0.5 bg-yellow-500 cursor-ew-resize pointer-events-auto group"
                style={{ left: `${(marker.time / duration) * waveformWidth}px` }}
                onMouseDown={(e) => handleMarkerDrag(marker.id, e)}
              >
                <div className="absolute top-0 -left-2 w-4 h-4 bg-yellow-500 rounded-full" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteMarker(marker.id);
                  }}
                  className="absolute top-5 -left-3 p-1 bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity z-20"
                  title="删除分割点"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-xs text-yellow-600 dark:text-yellow-400 whitespace-nowrap bg-white/80 dark:bg-zinc-800/80 px-1 rounded">
                  {formatTime(marker.time)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 隐藏的修复音频播放器 */}
      <audio ref={fixedAudioRef} className="hidden" />

      {/* 片段列表预览 */}
      {segments.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium mb-2">片段列表</h4>
          <div className="flex gap-1 overflow-x-auto pb-2">
            {segments.map((segment, index) => (
              <button
                key={segment.id}
                onClick={() => handleSegmentClick(segment)}
                onDoubleClick={() => playSegment(segment)}
                className={`flex-shrink-0 px-3 py-2 rounded text-sm transition-colors ${
                  selectedSegmentId === segment.id
                    ? 'bg-blue-500 text-white'
                    : segment.isFixed
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600'
                }`}
                title={`双击播放 | ${formatTime(segment.start)} - ${formatTime(segment.end)}`}
              >
                <div className="font-medium">#{index + 1}</div>
                <div className="text-xs opacity-75">
                  {formatTime(segment.end - segment.start)}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
