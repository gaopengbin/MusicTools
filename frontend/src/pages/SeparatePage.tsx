import { useState, useEffect, useRef } from 'react';
import { Upload, Scissors, Loader2, CheckCircle, AlertCircle, Download, Music, Mic, Drum, Play, Pause } from 'lucide-react';
import { separateApi, downloadApi, type ModelInfo, type SeparationResult, type DownloadedFile, type MusicTrack } from '../api/index';

interface SeparatePageProps {
  onPlayStem?: (path: string, name: string) => void;
  currentTrack?: MusicTrack | null;
  isPlaying?: boolean;
}

interface BatchItem {
  id: string;
  name: string;
  type: 'file' | 'download';
  file?: File;
  downloadPath?: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  progress: number;
  message?: string;
  stems?: Record<string, string>;
}

export default function SeparatePage({ onPlayStem, currentTrack, isPlaying }: SeparatePageProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [selectedDownloads, setSelectedDownloads] = useState<string[]>([]);
  const [model, setModel] = useState<'htdemucs' | 'htdemucs_ft' | 'htdemucs_6s'>('htdemucs');
  const [mode, setMode] = useState<'vocals' | 'all'>('vocals');
  const [outputFormat, setOutputFormat] = useState<'mp3' | 'wav' | 'flac'>('mp3');
  const [loading, setLoading] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [separations, setSeparations] = useState<SeparationResult[]>([]);
  const [downloads, setDownloads] = useState<DownloadedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  // 加载模型列表
  useEffect(() => {
    separateApi.models().then(res => setModels(res.data)).catch(console.error);
    loadSeparations();
    loadDownloads();
  }, []);

  const loadSeparations = async () => {
    try {
      const res = await separateApi.list();
      setSeparations(res.data);
    } catch (err) {
      console.error('加载分离结果失败', err);
    }
  };

  const loadDownloads = async () => {
    try {
      const res = await downloadApi.list();
      setDownloads(res.data);
    } catch (err) {
      console.error('加载下载列表失败', err);
    }
  };

  // 处理文件选择（支持多文件）
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  // 拖拽上传处理
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragActive) setDragActive(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      setFiles(prev => [...prev, ...Array.from(dt.files)]);
      try { dt.clearData(); } catch {}
    }
  };

  // 移除已选文件
  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  // 切换已下载文件选中状态
  const toggleDownloadSelect = (path: string) => {
    setSelectedDownloads(prev =>
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    );
  };

  // 全选/取消全选已下载文件
  const toggleAllDownloads = () => {
    if (selectedDownloads.length === downloads.length) {
      setSelectedDownloads([]);
    } else {
      setSelectedDownloads(downloads.map(d => d.path));
    }
  };

  // 处理单个分离任务，返回 Promise
  const processSingleItem = (item: BatchItem): Promise<BatchItem> => {
    return new Promise(async (resolve) => {
      setBatchItems(prev => prev.map(b => b.id === item.id ? { ...b, status: 'processing' as const } : b));

      try {
        let start;
        if (item.type === 'file' && item.file) {
          start = await separateApi.uploadAsync(item.file, { model, mode, outputFormat });
        } else if (item.type === 'download' && item.downloadPath) {
          start = await separateApi.localAsync({ file_path: item.downloadPath, model, mode, output_format: outputFormat });
        } else {
          resolve({ ...item, status: 'error', message: '无效的文件' });
          return;
        }

        const taskId = start.data.task_id;

        const timer = setInterval(async () => {
          try {
            const pr = await separateApi.progress(taskId);
            const pct = Math.max(0, Math.min(100, Math.round(pr.data.progress)));
            setBatchItems(prev => prev.map(b => b.id === item.id ? { ...b, progress: pct } : b));

            if (pr.data.status === 'done') {
              try {
                const rr = await separateApi.result(taskId);
                if (rr.data.success && rr.data.stems) {
                  clearInterval(timer);
                  const updated = { ...item, status: 'done' as const, progress: 100, message: rr.data.note ? `分离完成（${rr.data.note}）` : '分离完成！', stems: rr.data.stems };
                  setBatchItems(prev => prev.map(b => b.id === item.id ? updated : b));
                  resolve(updated);
                  return;
                }
              } catch {
                // 结果未准备好，继续轮询
              }
            }
            if (pr.data.status === 'error') {
              clearInterval(timer);
              const updated = { ...item, status: 'error' as const, message: pr.data.error || '分离失败' };
              setBatchItems(prev => prev.map(b => b.id === item.id ? updated : b));
              resolve(updated);
            }
          } catch {
            // 202 未完成等
          }
        }, 1000);
      } catch (err: any) {
        const updated = { ...item, status: 'error' as const, message: err.response?.data?.detail || '分离失败' };
        setBatchItems(prev => prev.map(b => b.id === item.id ? updated : b));
        resolve(updated);
      }
    });
  };

  // 批量处理分离
  const handleSeparate = async () => {
    // 构建待处理列表
    const items: BatchItem[] = [];

    files.forEach((f, i) => {
      items.push({
        id: `file-${i}-${Date.now()}`,
        name: f.name,
        type: 'file',
        file: f,
        status: 'pending',
        progress: 0,
      });
    });

    selectedDownloads.forEach((path) => {
      const dl = downloads.find(d => d.path === path);
      items.push({
        id: `dl-${path}`,
        name: dl?.name || path,
        type: 'download',
        downloadPath: path,
        status: 'pending',
        progress: 0,
      });
    });

    if (items.length === 0) return;

    setLoading(true);
    setBatchItems(items);

    // 顺序处理每个任务
    for (const item of items) {
      await processSingleItem(item);
    }

    setLoading(false);
    await loadSeparations();
    // 清空选择
    setFiles([]);
    setSelectedDownloads([]);
  };

  // 格式化文件大小
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // stem 英文名 → 中文显示名
  const stemNameMap: Record<string, string> = {
    vocals: '人声',
    no_vocals: '伴奏',
    accompaniment: '伴奏',
    other: '其他',
    drums: '鼓',
    bass: '贝斯',
    guitar: '吉他',
    piano: '钢琴',
  };

  const getStemLabel = (name: string): string => {
    const lower = name.toLowerCase();
    // 按 key 长度降序，优先匹配更具体的 key（如 no_vocals 先于 vocals）
    const sorted = Object.entries(stemNameMap).sort((a, b) => b[0].length - a[0].length);
    for (const [key, label] of sorted) {
      if (lower.includes(key)) return label;
    }
    return name;
  };

  // 获取音轨图标
  const getStemIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('vocal')) return <Mic className="w-4 h-4" />;
    if (lower.includes('drum')) return <Drum className="w-4 h-4" />;
    if (lower.includes('bass') || lower.includes('piano') || lower.includes('guitar')) return <Music className="w-4 h-4" />;
    return <Music className="w-4 h-4" />;
  };

  // 判断某 stem 是否正在播放
  const isStemPlaying = (path: string) =>
    currentTrack?.id === `stem-${path}` && isPlaying;

  // 模型详细说明
  const modelDescriptions: Record<string, string> = {
    htdemucs: '默认模型，速度和质量平衡，适合大多数场景',
    htdemucs_ft: '精调版本，分离质量更高，但速度慢约4倍',
    htdemucs_6s: '6音轨版本，额外分离钢琴和吉他，适合复杂编曲',
  };

  return (
    <div className="space-y-6">
      {/* 分离表单 */}
      <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Scissors className="w-5 h-5" />
          人声分离
        </h2>

        <div className="space-y-4">
          {/* 文件选择 */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">选择音频文件（支持多选）</label>
            
            {/* 上传新文件 */}
            <div 
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-8 cursor-pointer transition flex flex-col items-center gap-2
                        ${dragActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-zinc-300 dark:border-zinc-600 hover:border-blue-500 dark:hover:border-blue-400'}`}
            >
              <Upload className="w-8 h-8 text-zinc-400" />
              <p className="text-zinc-600 dark:text-zinc-400">
                点击或拖拽上传音频文件（可多选）
              </p>
              <p className="text-xs text-zinc-400">支持 MP3, WAV, FLAC, M4A 等格式</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {/* 已选上传文件列表 */}
            {files.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm text-zinc-500">已选上传文件 ({files.length})</p>
                {files.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="flex items-center justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-700/50 rounded-lg">
                    <span className="text-sm truncate flex-1">{f.name}</span>
                    <button onClick={() => removeFile(i)} className="text-red-500 hover:text-red-700 text-xs ml-2">移除</button>
                  </div>
                ))}
              </div>
            )}

            {/* 或从已下载选择（多选复选框） */}
            {downloads.length > 0 && (
              <div>
                <div className="flex items-center justify-between my-2">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">或勾选已下载的音频</p>
                  <button
                    onClick={toggleAllDownloads}
                    className="text-xs text-purple-600 hover:text-purple-700"
                  >
                    {selectedDownloads.length === downloads.length ? '取消全选' : '全选'}
                  </button>
                </div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {downloads.map((d) => (
                    <label
                      key={d.path}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition ${
                        selectedDownloads.includes(d.path)
                          ? 'bg-purple-50 dark:bg-purple-900/20 border border-purple-300 dark:border-purple-700'
                          : 'bg-zinc-50 dark:bg-zinc-700/50 border border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedDownloads.includes(d.path)}
                        onChange={() => toggleDownloadSelect(d.path)}
                        className="accent-purple-600"
                      />
                      <Music className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                      <span className="text-sm truncate">{d.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 已选总数提示 */}
          {(files.length + selectedDownloads.length) > 0 && (
            <p className="text-sm text-purple-600 font-medium">
              共选择 {files.length + selectedDownloads.length} 个文件
            </p>
          )}

          {/* 分离选项 */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">分离模型</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as any)}
                className="w-full px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 
                         bg-white dark:bg-zinc-700"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <p className="text-xs text-zinc-500 mt-1">
                {modelDescriptions[model] || models.find(m => m.id === model)?.description}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">分离模式</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as any)}
                className="w-full px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 
                         bg-white dark:bg-zinc-700"
              >
                <option value="vocals">人声/伴奏</option>
                <option value="all">全部音轨</option>
              </select>
              <p className="text-xs text-zinc-500 mt-1">
                {mode === 'vocals' ? '分离人声和伴奏' : '分离人声、鼓、贝斯等'}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">输出格式</label>
              <select
                value={outputFormat}
                onChange={(e) => setOutputFormat(e.target.value as any)}
                className="w-full px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 
                         bg-white dark:bg-zinc-700"
              >
                <option value="mp3">MP3</option>
                <option value="wav">WAV</option>
                <option value="flac">FLAC</option>
              </select>
            </div>
          </div>

          {/* 分离按钮 */}
          <button
            onClick={handleSeparate}
            disabled={loading || (files.length === 0 && selectedDownloads.length === 0)}
            className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium
                     disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                批量处理中...
              </>
            ) : (
              <>
                <Scissors className="w-5 h-5" />
                {(files.length + selectedDownloads.length) > 1
                  ? `批量分离 (${files.length + selectedDownloads.length} 个文件)`
                  : '开始分离'}
              </>
            )}
          </button>

          {/* 批量进度列表 */}
          {batchItems.length > 0 && (
            <div className="space-y-2 mt-3">
              {batchItems.map((item) => (
                <div key={item.id} className={`p-3 rounded-lg border ${
                  item.status === 'done' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' :
                  item.status === 'error' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' :
                  item.status === 'processing' ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800' :
                  'bg-zinc-50 dark:bg-zinc-700/50 border-zinc-200 dark:border-zinc-700'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    {item.status === 'done' && <CheckCircle className="w-4 h-4 text-green-600" />}
                    {item.status === 'error' && <AlertCircle className="w-4 h-4 text-red-600" />}
                    {item.status === 'processing' && <Loader2 className="w-4 h-4 animate-spin text-purple-600" />}
                    {item.status === 'pending' && <Music className="w-4 h-4 text-zinc-400" />}
                    <span className="text-sm font-medium truncate flex-1">{item.name}</span>
                    {item.status === 'processing' && <span className="text-xs text-purple-600">{item.progress}%</span>}
                  </div>
                  {item.status === 'processing' && (
                    <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                      <div className="h-1.5 bg-purple-600 transition-all" style={{ width: `${item.progress}%` }} />
                    </div>
                  )}
                  {item.status === 'error' && item.message && (
                    <p className="text-xs text-red-600 mt-1">{item.message}</p>
                  )}
                  {item.status === 'done' && item.stems && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {Object.entries(item.stems).map(([name, path]) => (
                        <a
                          key={name}
                          href={separateApi.getFileUrl(path)}
                          download
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-white dark:bg-zinc-800 
                                   rounded-full text-xs hover:bg-zinc-100 dark:hover:bg-zinc-700 transition"
                        >
                          <Download className="w-3 h-3" />
                          {name}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>


      {/* 分离历史 */}
      <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Music className="w-5 h-5" />
          分离历史
        </h2>
        
        {separations.length === 0 ? (
          <p className="text-zinc-500 dark:text-zinc-400 text-center py-8">暂无分离记录</p>
        ) : (
          <div className="space-y-4">
            {separations.map((sep) => (
              <div 
                key={`${sep.track}-${sep.model}`}
                className="p-4 bg-zinc-50 dark:bg-zinc-700/50 rounded-lg"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium">{sep.track}</h3>
                  <span className="text-xs px-2 py-1 bg-zinc-200 dark:bg-zinc-600 rounded">
                    {sep.model}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {sep.stems.map((stem) => (
                    <div key={stem.path} className="inline-flex items-center gap-1">
                      <button
                        onClick={() => onPlayStem?.(stem.path, `${sep.track} - ${getStemLabel(stem.name)}`)}
                        className={`p-2 rounded-lg transition border ${
                          isStemPlaying(stem.path)
                            ? 'bg-purple-100 dark:bg-purple-900/30 border-purple-300 dark:border-purple-700 text-purple-600'
                            : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                        }`}
                        title={isStemPlaying(stem.path) ? '暂停' : '播放'}
                      >
                        {isStemPlaying(stem.path) ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>
                      <a
                        href={separateApi.getFileUrl(stem.path)}
                        download
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-zinc-800 
                                 rounded-lg text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 transition border
                                 border-zinc-200 dark:border-zinc-600"
                      >
                        {getStemIcon(stem.name)}
                        {getStemLabel(stem.name)}
                        <span className="text-zinc-400 text-xs">{formatSize(stem.size)}</span>
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
