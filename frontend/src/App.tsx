import { useState, useRef, useCallback } from 'react';
import { Music2, FolderDown, Scissors, Search, Play, Pause, X, Maximize2, Music } from 'lucide-react';
import DownloadsPage from './pages/DownloadsPage';
import SeparatePage from './pages/SeparatePage';
import MusicPage from './pages/MusicPage';
import PlayerPage from './pages/PlayerPage';
import { musicApi, downloadApi, type MusicTrack, type DownloadedFile, API_BASE } from './api/index';

type Tab = 'music' | 'downloads' | 'separate';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('music');

  // ===== Global Player State =====
  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});
  const [lyricsCache, setLyricsCache] = useState<Record<string, string>>({});
  const [playlist, setPlaylist] = useState<MusicTrack[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);

  const currentIndex = currentTrack ? playlist.findIndex(t => t.id === currentTrack.id) : -1;

  const handleGlobalPlay = useCallback(async (track: MusicTrack, tracks: MusicTrack[], source: string) => {
    if (currentTrack?.id === track.id && audioUrl) {
      if (isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(false);
      } else {
        audioRef.current?.play();
        setIsPlaying(true);
      }
      return;
    }

    setPlaylist(tracks);
    try {
      const res = await musicApi.getUrl(track.url_id || track.id, track.source || source);
      if (res.data.url) {
        setAudioUrl(res.data.url);
        setCurrentTrack(track);
        setIsPlaying(true);
        setTimeout(() => audioRef.current?.play(), 100);
      }
    } catch {}
  }, [currentTrack, audioUrl, isPlaying]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0 && playlist[currentIndex - 1]) {
      const track = playlist[currentIndex - 1];
      handleGlobalPlay(track, playlist, track.source || 'netease');
    }
  }, [currentIndex, playlist, handleGlobalPlay]);

  const handleNext = useCallback(() => {
    if (currentIndex < playlist.length - 1 && playlist[currentIndex + 1]) {
      const track = playlist[currentIndex + 1];
      handleGlobalPlay(track, playlist, track.source || 'netease');
    }
  }, [currentIndex, playlist, handleGlobalPlay]);

  const handleClosePlayer = useCallback(() => {
    audioRef.current?.pause();
    setCurrentTrack(null);
    setAudioUrl(null);
    setIsPlaying(false);
    setShowPlayer(false);
  }, []);

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      audioRef.current?.pause();
    } else {
      audioRef.current?.play();
    }
  }, [isPlaying]);

  const updateCoverUrl = useCallback((id: string, url: string) => {
    setCoverUrls(prev => ({ ...prev, [id]: url }));
  }, []);

  const handlePlayStem = useCallback((path: string, name: string) => {
    const trackId = `stem-${path}`;
    const track: MusicTrack = {
      id: trackId,
      name,
      artist: '',
      album: null,
      pic_id: null,
      lyric_id: null,
      url_id: null,
      source: 'local',
    };
    if (currentTrack?.id === trackId) {
      if (isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(false);
      } else {
        audioRef.current?.play();
        setIsPlaying(true);
      }
      return;
    }
    const url = `${API_BASE}/separate/file?path=${encodeURIComponent(path)}`;
    setAudioUrl(url);
    setCurrentTrack(track);
    setPlaylist([track]);
    setIsPlaying(true);
    setTimeout(() => audioRef.current?.play(), 100);
  }, [currentTrack, isPlaying]);

  const handlePlayDownloadFile = useCallback(async (file: DownloadedFile) => {
    const trackId = `dl-${file.name}`;
    const baseName = file.name.replace(/\.[^.]+$/, '');
    const track: MusicTrack = {
      id: trackId,
      name: baseName,
      artist: '',
      album: null,
      pic_id: null,
      lyric_id: null,
      url_id: null,
      source: 'local',
    };
    const url = downloadApi.getFileUrl(file.name);
    setAudioUrl(url);
    setCurrentTrack(track);
    setPlaylist([track]);
    setIsPlaying(true);
    setTimeout(() => audioRef.current?.play(), 100);

    // 异步拉取 ID3 元数据，更新封面和歌词
    try {
      const res = await downloadApi.getMeta(file.name);
      const meta = res.data;
      const updatedTrack: MusicTrack = {
        ...track,
        name: meta.title || baseName,
        artist: meta.artist || '',
        album: meta.album || null,
        pic_id: meta.cover_base64 ? `local-${file.name}` : null,
        lyric_id: meta.lyrics ? trackId : null,
      };
      if (meta.cover_base64) {
        updateCoverUrl(`local-${file.name}`, meta.cover_base64);
      }
      if (meta.lyrics) {
        setLyricsCache(prev => ({ ...prev, [trackId]: meta.lyrics! }));
      }
      setCurrentTrack(updatedTrack);
      setPlaylist([updatedTrack]);
    } catch {
      // 无元数据，保持基础 track
    }
  }, [updateCoverUrl]);

  const hasPlayer = !!currentTrack;

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
      {/* Header */}
      <header className="bg-white dark:bg-zinc-800 shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
                <Music2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">MusicTools</h1>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">音乐搜索 · 下载 · 人声分离</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
        <div className="max-w-4xl mx-auto px-4">
          <nav className="flex gap-1">
            <button
              onClick={() => setActiveTab('music')}
              className={`flex items-center gap-2 px-4 py-3 font-medium transition border-b-2 -mb-px ${
                activeTab === 'music'
                  ? 'border-green-500 text-green-600 dark:text-green-400'
                  : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <Search className="w-4 h-4" />
              音乐搜索
            </button>
            <button
              onClick={() => setActiveTab('downloads')}
              className={`flex items-center gap-2 px-4 py-3 font-medium transition border-b-2 -mb-px ${
                activeTab === 'downloads'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <FolderDown className="w-4 h-4" />
              下载中心
            </button>
            <button
              onClick={() => setActiveTab('separate')}
              className={`flex items-center gap-2 px-4 py-3 font-medium transition border-b-2 -mb-px ${
                activeTab === 'separate'
                  ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                  : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <Scissors className="w-4 h-4" />
              人声分离
            </button>
          </nav>
        </div>
      </div>

      {/* Main Content — all pages rendered, hidden via CSS display */}
      <div className={`px-4 py-6 max-w-4xl mx-auto page-enter ${hasPlayer ? 'pb-24' : ''}`} style={{ display: activeTab === 'music' ? undefined : 'none' }}>
        <MusicPage
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          onPlay={handleGlobalPlay}
          coverUrls={coverUrls}
          onCoverUrl={updateCoverUrl}
        />
      </div>
      <div className={`px-4 py-6 max-w-4xl mx-auto page-enter ${hasPlayer ? 'pb-24' : ''}`} style={{ display: activeTab === 'downloads' ? undefined : 'none' }}>
        <DownloadsPage onPlayFile={handlePlayDownloadFile} currentTrack={currentTrack} isPlaying={isPlaying} />
      </div>
      <div className={`px-4 py-6 max-w-4xl mx-auto page-enter ${hasPlayer ? 'pb-24' : ''}`} style={{ display: activeTab === 'separate' ? undefined : 'none' }}>
        <SeparatePage onPlayStem={handlePlayStem} currentTrack={currentTrack} isPlaying={isPlaying} />
      </div>

      {/* Global Bottom Player Bar */}
      {currentTrack && (
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-zinc-800 border-t border-zinc-200 dark:border-zinc-700 shadow-lg z-50 animate-slide-up">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
            <div className="w-12 h-12 rounded overflow-hidden bg-zinc-200 dark:bg-zinc-600 flex-shrink-0">
              {currentTrack.pic_id && coverUrls[currentTrack.pic_id] ? (
                <img src={coverUrls[currentTrack.pic_id]} alt="" className="w-full h-full object-cover" />
              ) : (
                <Music className="w-6 h-6 m-3 text-zinc-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{currentTrack.name}</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate">{currentTrack.artist}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleTogglePlay}
                className="p-3 bg-green-600 hover:bg-green-700 text-white rounded-full transition"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
              <button
                onClick={() => setShowPlayer(true)}
                className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition"
                title="全屏播放"
              >
                <Maximize2 className="w-5 h-5" />
              </button>
              <button
                onClick={handleClosePlayer}
                className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden audio element — always mounted */}
      <audio
        ref={audioRef}
        src={audioUrl || undefined}
        onEnded={handleNext}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />

      {/* Full-screen Player Page */}
      {showPlayer && currentTrack && audioUrl && (
        <PlayerPage
          track={currentTrack}
          audioUrl={audioUrl}
          isPlaying={isPlaying}
          coverUrl={currentTrack.pic_id ? coverUrls[currentTrack.pic_id] : undefined}
          playlist={playlist}
          currentIndex={currentIndex}
          onClose={() => setShowPlayer(false)}
          onTogglePlay={handleTogglePlay}
          onPrev={handlePrev}
          onNext={handleNext}
          audioRef={audioRef as React.RefObject<HTMLAudioElement>}
          lyricsCache={lyricsCache}
          onLyricLoaded={(id, lyric) => setLyricsCache(prev => ({ ...prev, [id]: lyric }))}
        />
      )}

      {/* Footer */}
      <footer className="text-center py-4 text-sm text-zinc-500 dark:text-zinc-400">
        Powered by GD Studio Music API & yt-dlp & Demucs
      </footer>
    </div>
  );
}

export default App;
