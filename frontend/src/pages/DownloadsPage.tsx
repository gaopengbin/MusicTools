import { useState, useEffect } from 'react';
import { FolderDown, Music, Download, Trash2, Play, Pause, Loader2, RefreshCw } from 'lucide-react';
import { downloadApi, type DownloadedFile, type DownloadMeta, type MusicTrack } from '../api/index';
import Toast, { type ToastType } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';

interface DownloadsPageProps {
  onPlayFile?: (file: DownloadedFile) => void;
  currentTrack?: MusicTrack | null;
  isPlaying?: boolean;
}

export default function DownloadsPage({ onPlayFile, currentTrack, isPlaying }: DownloadsPageProps) {
  const [downloads, setDownloads] = useState<DownloadedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DownloadedFile | null>(null);
  const [metaCache, setMetaCache] = useState<Record<string, DownloadMeta>>({});
  const [withLyricsSet, setWithLyricsSet] = useState<Set<string>>(new Set());

  const toggleWithLyrics = (name: string) => {
    setWithLyricsSet(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const triggerDownload = (url: string, filename?: string) => {
    const a = document.createElement('a');
    a.href = url;
    if (filename) a.download = filename;
    else a.setAttribute('download', '');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadFile = (file: DownloadedFile) => {
    triggerDownload(downloadApi.getFileUrl(file.name));
    if (withLyricsSet.has(file.name)) {
      setTimeout(() => triggerDownload(downloadApi.getLrcUrl(file.name)), 300);
    }
  };

  // 加载下载列表
  const loadDownloads = async () => {
    setLoading(true);
    try {
      const res = await downloadApi.list();
      setDownloads(res.data);
      // 异步加载每个文件的封面元数据
      res.data.forEach(async (file) => {
        if (!file.name.toLowerCase().endsWith('.mp3')) return;
        try {
          const meta = await downloadApi.getMeta(file.name);
          setMetaCache(prev => ({ ...prev, [file.name]: meta.data }));
        } catch {}
      });
    } catch (err) {
      console.error('加载下载列表失败', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDownloads();
  }, []);

  // 格式化文件大小
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 删除文件
  const handleDelete = async (file: DownloadedFile) => {
    setDeleting(file.path);
    try {
      await downloadApi.delete(file.name);
      setDownloads(prev => prev.filter(d => d.path !== file.path));
      setToast({ message: '删除成功', type: 'success' });
    } catch (err) {
      console.error('删除失败', err);
      setToast({ message: '删除失败', type: 'error' });
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
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
      
      {/* 删除确认对话框 */}
      {confirmDelete && (
        <ConfirmDialog
          title="删除文件"
          message={`确定要删除 "${confirmDelete.name}" 吗？此操作不可撤销。`}
          type="danger"
          confirmText="删除"
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <FolderDown className="w-5 h-5" />
            下载中心
            {downloads.length > 0 && (
              <span className="text-sm font-normal text-zinc-500">({downloads.length}首)</span>
            )}
          </h2>
          <button
            onClick={loadDownloads}
            disabled={loading}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition"
            title="刷新"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : downloads.length === 0 ? (
          <div className="text-center py-12">
            <FolderDown className="w-16 h-16 mx-auto text-zinc-300 dark:text-zinc-600 mb-4" />
            <p className="text-zinc-500 dark:text-zinc-400">暂无下载记录</p>
            <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">
              在音乐搜索页面下载歌曲后会显示在这里
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {downloads.map((file, index) => (
              <div
                key={file.path}
                className={`list-item-enter flex items-center justify-between p-3 rounded-lg transition ${
                  currentTrack?.id === `dl-${file.name}`
                    ? 'bg-green-50 dark:bg-green-900/20'
                    : 'bg-zinc-50 dark:bg-zinc-700/50 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                }`}
                style={{ animationDelay: `${Math.min(index * 40, 300)}ms` }}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    {metaCache[file.name]?.cover_base64 ? (
                      <img
                        src={metaCache[file.name].cover_base64!}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Music className="w-5 h-5 text-blue-600" />
                    )}
                    {currentTrack?.id === `dl-${file.name}` && isPlaying && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <div className="flex gap-0.5">
                          <span className="w-1 h-4 bg-white animate-pulse" style={{ animationDelay: '0ms' }} />
                          <span className="w-1 h-4 bg-white animate-pulse" style={{ animationDelay: '150ms' }} />
                          <span className="w-1 h-4 bg-white animate-pulse" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">
                      {metaCache[file.name]?.title || file.name.replace(/\.[^.]+$/, '')}
                    </p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate">
                      {metaCache[file.name]?.artist
                        ? `${metaCache[file.name].artist}${metaCache[file.name].album ? ' · ' + metaCache[file.name].album : ''}`
                        : `${formatSize(file.size)} · ${formatTime(file.modified)}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {onPlayFile && (
                    <button
                      onClick={() => onPlayFile(file)}
                      className={`p-2 rounded-lg transition ${
                        currentTrack?.id === `dl-${file.name}`
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-600 hover:bg-green-200 dark:hover:bg-green-900/50'
                          : 'hover:bg-zinc-200 dark:hover:bg-zinc-600'
                      }`}
                      title={currentTrack?.id === `dl-${file.name}` && isPlaying ? '暂停' : '播放'}
                    >
                      {currentTrack?.id === `dl-${file.name}` && isPlaying
                        ? <Pause className="w-5 h-5" />
                        : <Play className="w-5 h-5" />}
                    </button>
                  )}
                  {/* 含歌词勾选 — 仅有嵌入歌词时显示 */}
                  {metaCache[file.name]?.lyrics && (
                    <label
                      className="flex items-center gap-1 px-2 py-1 rounded-lg cursor-pointer select-none
                                 hover:bg-zinc-200 dark:hover:bg-zinc-600 transition text-xs"
                      title="同时下载 LRC 歌词文件"
                    >
                      <input
                        type="checkbox"
                        checked={withLyricsSet.has(file.name)}
                        onChange={() => toggleWithLyrics(file.name)}
                        className="accent-blue-500"
                      />
                      <span className="text-zinc-600 dark:text-zinc-300">含歌词</span>
                    </label>
                  )}
                  <button
                    onClick={() => handleDownloadFile(file)}
                    className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-600 rounded-lg transition"
                    title={withLyricsSet.has(file.name) ? '下载 MP3 + LRC' : '下载到本地'}
                  >
                    <Download className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(file)}
                    disabled={deleting === file.path}
                    className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded-lg transition disabled:opacity-50"
                    title="删除"
                  >
                    {deleting === file.path ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Trash2 className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 使用说明 */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-sm text-blue-700 dark:text-blue-300">
        <p className="font-medium mb-1">💡 提示</p>
        <ul className="list-disc list-inside space-y-1 text-blue-600 dark:text-blue-400">
          <li>在「音乐搜索」页面点击下载按钮，歌曲会保存到这里</li>
          <li>在「人声分离」页面可以直接选择这里的文件进行处理</li>
          <li>点击下载图标可将文件下载到本地电脑</li>
        </ul>
      </div>
    </div>
  );
}
