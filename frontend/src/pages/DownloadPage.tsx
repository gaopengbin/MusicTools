import { useState } from 'react';
import { Download, Music, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { downloadApi, type MediaInfo, type DownloadedFile } from '../api/index';

export default function DownloadPage() {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<'mp3' | 'wav' | 'flac' | 'm4a'>('mp3');
  const [quality, setQuality] = useState<'best' | 'medium'>('best');
  const [loading, setLoading] = useState(false);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [downloads, setDownloads] = useState<DownloadedFile[]>([]);

  // 获取媒体信息
  const fetchInfo = async () => {
    if (!url.trim()) return;
    setLoadingInfo(true);
    setMediaInfo(null);
    try {
      const res = await downloadApi.getInfo(url);
      setMediaInfo(res.data);
    } catch (err: any) {
      setResult({ success: false, message: err.response?.data?.detail || '获取信息失败' });
    } finally {
      setLoadingInfo(false);
    }
  };

  // 下载
  const handleDownload = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await downloadApi.download({ url, format, quality });
      setResult({ success: true, message: `下载成功: ${res.data.title}` });
      // 刷新列表
      const listRes = await downloadApi.list();
      setDownloads(listRes.data);
    } catch (err: any) {
      setResult({ success: false, message: err.response?.data?.detail || '下载失败' });
    } finally {
      setLoading(false);
    }
  };

  // 加载下载列表
  const loadDownloads = async () => {
    try {
      const res = await downloadApi.list();
      setDownloads(res.data);
    } catch (err) {
      console.error('加载列表失败', err);
    }
  };

  // 组件挂载时加载列表
  useState(() => {
    loadDownloads();
  });

  // 格式化文件大小
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="space-y-6">
      {/* 下载表单 */}
      <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Download className="w-5 h-5" />
          音频下载
        </h2>
        
        {/* URL输入 */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">媒体URL</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="输入YouTube、B站、SoundCloud等平台链接"
                className="flex-1 px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 
                         bg-white dark:bg-zinc-700 focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <button
                onClick={fetchInfo}
                disabled={loadingInfo || !url.trim()}
                className="px-4 py-2 bg-zinc-100 dark:bg-zinc-700 rounded-lg hover:bg-zinc-200 
                         dark:hover:bg-zinc-600 disabled:opacity-50 transition"
              >
                {loadingInfo ? <Loader2 className="w-5 h-5 animate-spin" /> : '获取信息'}
              </button>
            </div>
          </div>

          {/* 媒体预览 */}
          {mediaInfo && (
            <div className="flex gap-4 p-4 bg-zinc-50 dark:bg-zinc-700/50 rounded-lg">
              {mediaInfo.thumbnail && (
                <img 
                  src={mediaInfo.thumbnail} 
                  alt="thumbnail" 
                  className="w-32 h-20 object-cover rounded"
                />
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-medium truncate">{mediaInfo.title}</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {mediaInfo.uploader}
                  {mediaInfo.duration && ` • ${Math.floor(mediaInfo.duration / 60)}:${(mediaInfo.duration % 60).toString().padStart(2, '0')}`}
                </p>
              </div>
            </div>
          )}

          {/* 选项 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">输出格式</label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as any)}
                className="w-full px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 
                         bg-white dark:bg-zinc-700"
              >
                <option value="mp3">MP3</option>
                <option value="wav">WAV</option>
                <option value="flac">FLAC</option>
                <option value="m4a">M4A</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">音质</label>
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value as any)}
                className="w-full px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 
                         bg-white dark:bg-zinc-700"
              >
                <option value="best">最佳 (320kbps)</option>
                <option value="medium">中等 (192kbps)</option>
              </select>
            </div>
          </div>

          {/* 下载按钮 */}
          <button
            onClick={handleDownload}
            disabled={loading || !url.trim()}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium
                     disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                下载中...
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                开始下载
              </>
            )}
          </button>

          {/* 结果提示 */}
          {result && (
            <div className={`flex items-center gap-2 p-3 rounded-lg ${
              result.success 
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
            }`}>
              {result.success ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              {result.message}
            </div>
          )}
        </div>
      </div>

      {/* 已下载文件列表 */}
      <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Music className="w-5 h-5" />
          已下载文件
        </h2>
        
        {downloads.length === 0 ? (
          <p className="text-zinc-500 dark:text-zinc-400 text-center py-8">暂无下载记录</p>
        ) : (
          <div className="space-y-2">
            {downloads.map((file) => (
              <div 
                key={file.path}
                className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-700/50 rounded-lg"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Music className="w-8 h-8 p-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{file.name}</p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">{formatSize(file.size)}</p>
                  </div>
                </div>
                <a
                  href={downloadApi.getFileUrl(file.name)}
                  download
                  className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-600 rounded-lg transition"
                >
                  <Download className="w-5 h-5" />
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
