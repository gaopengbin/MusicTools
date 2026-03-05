import { useState, useEffect } from 'react';
import { Search, Play, Pause, Download, Music, Loader2, ChevronDown } from 'lucide-react';
import { musicApi, type MusicTrack, type MusicSourceInfo } from '../api/index';
import Toast, { type ToastType } from '../components/Toast';

// 音乐源中文名映射
const SOURCE_NAMES: Record<string, string> = {
  netease: '网易云',
  tencent: 'QQ音乐',
  kugou: '酷狗',
  kuwo: '酷我',
  migu: '咪咕',
  spotify: 'Spotify',
  ytmusic: 'YouTube',
  apple: 'Apple',
  tidal: 'Tidal',
  qobuz: 'Qobuz',
  joox: 'JOOX',
  deezer: 'Deezer',
  ximalaya: '喜马拉雅',
};

interface MusicPageProps {
  currentTrack: MusicTrack | null;
  isPlaying: boolean;
  onPlay: (track: MusicTrack, tracks: MusicTrack[], source: string) => void;
  coverUrls: Record<string, string>;
  onCoverUrl: (id: string, url: string) => void;
}

export default function MusicPage({ currentTrack, isPlaying, onPlay, coverUrls, onCoverUrl }: MusicPageProps) {
  const [keyword, setKeyword] = useState('');
  const [source, setSource] = useState('netease');
  const [sources, setSources] = useState<MusicSourceInfo[]>([]);
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingTrackId, setLoadingTrackId] = useState<string | null>(null);
  
  // Toast通知
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  // 加载音乐源列表
  useEffect(() => {
    musicApi.getSources().then(res => {
      setSources(res.data.sources);
    }).catch(console.error);
  }, []);

  // 搜索音乐
  const handleSearch = async (loadMore = false) => {
    if (!keyword.trim()) return;
    
    const currentPage = loadMore ? page + 1 : 1;
    
    if (loadMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setTracks([]);
      setPage(1);
      setHasMore(true);
    }
    setError(null);
    
    try {
      const res = await musicApi.search(keyword, source, 30, currentPage);
      const newTracks = res.data.tracks;
      
      if (loadMore) {
        setTracks(prev => [...prev, ...newTracks]);
      } else {
        setTracks(newTracks);
      }
      
      setPage(currentPage);
      setHasMore(newTracks.length >= 30);
      
      // 预加载封面
      newTracks.forEach(async (track) => {
        if (track.pic_id && !coverUrls[track.pic_id]) {
          try {
            const picRes = await musicApi.getPic(track.pic_id, track.source || source);
            if (picRes.data.url) {
              onCoverUrl(track.pic_id!, picRes.data.url);
            }
          } catch {}
        }
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || '搜索失败');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // 播放/暂停 — delegate to global player
  const handlePlay = (track: MusicTrack) => {
    setLoadingTrackId(track.id);
    onPlay(track, tracks, source);
    // Clear loading indicator after a short delay
    setTimeout(() => setLoadingTrackId(null), 500);
  };

  // 下载到服务器
  const handleDownload = async (track: MusicTrack) => {
    setLoadingTrackId(track.id);
    try {
      const res = await musicApi.download({
        id: track.url_id || track.id,
        source: track.source || source,
        name: track.name,
        artist: track.artist,
        album: track.album,
        pic_id: track.pic_id,
        lyric_id: track.lyric_id,
        br: 320
      });
      if (res.data.success) {
        setError(null);
        setToast({ message: `下载成功: ${res.data.file_name}`, type: 'success' });
      } else {
        setToast({ message: res.data.error || '下载失败', type: 'error' });
      }
    } catch (err: any) {
      setToast({ message: err.response?.data?.detail || '下载失败', type: 'error' });
    } finally {
      setLoadingTrackId(null);
    }
  };

  // 键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast通知 */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      {/* 搜索区域 */}
      <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Search className="w-5 h-5" />
          音乐搜索
        </h2>

        <div className="flex gap-3">
          {/* 音乐源选择 */}
          <div className="relative">
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="appearance-none pl-4 pr-10 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600
                       bg-white dark:bg-zinc-700 cursor-pointer min-w-[120px]"
            >
              {sources.map(s => (
                <option key={s.id} value={s.id}>
                  {SOURCE_NAMES[s.id] || s.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-zinc-400" />
          </div>

          {/* 搜索输入 */}
          <div className="flex-1 flex gap-2">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入歌曲名、歌手..."
              className="flex-1 px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600
                       bg-white dark:bg-zinc-700 focus:ring-2 focus:ring-green-500 outline-none"
            />
            <button
              onClick={() => handleSearch()}
              disabled={loading || !keyword.trim()}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium
                       disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
              搜索
            </button>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg">
            {error}
          </div>
        )}
      </div>

      {/* 搜索结果 */}
      <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Music className="w-5 h-5" />
          搜索结果
          {tracks.length > 0 && <span className="text-sm font-normal text-zinc-500">({tracks.length}首)</span>}
        </h2>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-green-500" />
          </div>
        ) : tracks.length === 0 ? (
          <p className="text-zinc-500 dark:text-zinc-400 text-center py-8">
            {keyword ? '未找到相关歌曲' : '输入关键词开始搜索'}
          </p>
        ) : (
          <div className="space-y-2">
            {tracks.map((track, index) => (
              <div
                key={`${track.id}-${index}`}
                className={`list-item-enter flex items-center gap-4 p-3 rounded-lg transition cursor-pointer
                          ${currentTrack?.id === track.id 
                            ? 'bg-green-50 dark:bg-green-900/20' 
                            : 'bg-zinc-50 dark:bg-zinc-700/50 hover:bg-zinc-100 dark:hover:bg-zinc-700'}`}
                style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
                onClick={() => handlePlay(track)}
              >
                {/* 封面 */}
                <div className="relative w-12 h-12 rounded overflow-hidden bg-zinc-200 dark:bg-zinc-600 flex-shrink-0">
                  {track.pic_id && coverUrls[track.pic_id] ? (
                    <img src={coverUrls[track.pic_id]} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Music className="w-6 h-6 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-zinc-400" />
                  )}
                  {/* 播放状态指示 */}
                  {currentTrack?.id === track.id && isPlaying && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <div className="flex gap-0.5">
                        <span className="w-1 h-4 bg-white animate-pulse" style={{ animationDelay: '0ms' }} />
                        <span className="w-1 h-4 bg-white animate-pulse" style={{ animationDelay: '150ms' }} />
                        <span className="w-1 h-4 bg-white animate-pulse" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* 歌曲信息 */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{track.name}</p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate">
                    {track.artist}
                    {track.album && ` · ${track.album}`}
                  </p>
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {loadingTrackId === track.id ? (
                    <div className="p-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => handlePlay(track)}
                        className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-600 rounded-lg transition"
                        title="播放"
                      >
                        {currentTrack?.id === track.id && isPlaying ? (
                          <Pause className="w-5 h-5" />
                        ) : (
                          <Play className="w-5 h-5" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDownload(track)}
                        className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-600 rounded-lg transition"
                        title="下载"
                      >
                        <Download className="w-5 h-5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
            
            {/* 加载更多 */}
            {hasMore && tracks.length > 0 && (
              <button
                onClick={() => handleSearch(true)}
                disabled={loadingMore}
                className="w-full py-3 mt-4 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600
                         rounded-lg font-medium transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loadingMore ? (
                  <><Loader2 className="w-5 h-5 animate-spin" />加载中...</>
                ) : (
                  '加载更多'
                )}
              </button>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
