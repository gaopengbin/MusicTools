import { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Music, Download, Loader2, Save, FolderOpen, FileText, Trash2, ArrowRight } from 'lucide-react';
import TrackEditor from '../components/TrackEditor';
import type { Marker, Segment } from '../components/TrackEditor';
import SegmentList from '../components/SegmentList';
import { separateApi, type SeparationResult, API_BASE } from '../api/index';

export default function TrackEditorPage() {
  // 音频状态
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioPath, setAudioPath] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [separations, setSeparations] = useState<SeparationResult[]>([]);
  const [selectedVocal, setSelectedVocal] = useState('');

  // 编辑状态
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');

  // LRC 歌词
  const [lrcContent, setLrcContent] = useState('');
  const [lyrics, setLyrics] = useState<Array<{ index: number; start_seconds: number; end_seconds: number; text: string }>>([]);
  const lrcInputRef = useRef<HTMLInputElement>(null);

  // 工程状态
  const [projectName, setProjectName] = useState('');
  const [projects, setProjects] = useState<Array<{ name: string; path: string; updated_at?: number }>>([]);
  const [showProjectList, setShowProjectList] = useState(false);

  // Vevo 高级参数
  const [flowMatchingSteps, setFlowMatchingSteps] = useState(32);
  const [durationRatio, setDurationRatio] = useState(1.0);
  const [targetSampleRate, setTargetSampleRate] = useState(24000);
  const [targetDb, setTargetDb] = useState(-25);

  // 导出状态
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ success: boolean; path?: string; error?: string } | null>(null);

  // 音频播放器
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 加载已分离的人声列表和工程列表
  useEffect(() => {
    loadSeparations();
    loadProjects();
  }, []);

  const loadSeparations = async () => {
    try {
      const res = await separateApi.list();
      setSeparations(res.data);
    } catch (err) {
      console.error('加载分离结果失败', err);
    }
  };

  // 加载工程列表
  const loadProjects = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/lyric-fix/project/list`);
      const data = await res.json();
      setProjects(data.filter((p: any) => p.name.startsWith('track_')));
    } catch (err) {
      console.error('加载工程列表失败', err);
    }
  };

  // 解析 LRC
  const handleLrcUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setLrcContent(text);
    await parseLrc(text);
  };

  const parseLrc = async (content: string) => {
    try {
      const formData = new FormData();
      formData.append('lrc_content', content);
      const res = await fetch(`${API_BASE}/api/lyric-fix/parse-lrc-text`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setLyrics(data.lines);
      }
    } catch (err) {
      console.error('解析歌词失败', err);
    }
  };

  // 保存工程
  const saveProject = async () => {
    let name = projectName.trim();
    if (!name) {
      name = prompt('请输入工程名称', `track_${Date.now()}`) || '';
      if (!name) return;
      name = `track_${name}`;
      setProjectName(name);
    }
    try {
      await fetch(`${API_BASE}/api/lyric-fix/project/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          audio_path: audioPath,
          lrc_content: lrcContent,
          lyrics: lyrics.map((l, i) => ({ ...l, index: i })),
          language,
          // 额外存储音轨编辑器特有数据
          markers,
          segments,
        }),
      });
      loadProjects();
      alert('工程已保存');
    } catch (err) {
      console.error('保存工程失败', err);
      alert('保存失败');
    }
  };

  // 加载工程
  const loadProject = async (name: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/lyric-fix/project/load/${encodeURIComponent(name)}`);
      const data = await res.json();
      setProjectName(data.name || '');
      setAudioPath(data.audio_path || '');
      setLrcContent(data.lrc_content || '');
      setLyrics(data.lyrics || []);
      setLanguage(data.language || 'zh');
      setMarkers(data.markers || []);
      setSegments(data.segments || []);
      if (data.audio_path) {
        if (data.audio_path.includes('htdemucs')) {
          setSelectedVocal(data.audio_path);
          setAudioFile(null);
          setAudioUrl(`${API_BASE}/api/separate/file?path=${encodeURIComponent(data.audio_path)}`);
        } else {
          setAudioUrl(`${API_BASE}/api/lyric-fix/file?path=${encodeURIComponent(data.audio_path)}`);
        }
      }
      setShowProjectList(false);
    } catch (err) {
      console.error('加载工程失败', err);
      alert('加载失败');
    }
  };

  // 删除工程
  const deleteProject = async (name: string) => {
    if (!confirm(`确定要删除工程「${name}」吗？`)) return;
    try {
      await fetch(`${API_BASE}/api/lyric-fix/project/${encodeURIComponent(name)}`, { method: 'DELETE' });
      loadProjects();
    } catch (err) {
      console.error('删除工程失败', err);
    }
  };

  // 将歌词填入当前片段（追加而非替换）
  const fillLyricToSegment = (lyric: { text: string }) => {
    if (!selectedSegmentId) {
      alert('请先选择一个片段');
      return;
    }
    const currentSegment = segments.find(s => s.id === selectedSegmentId);
    const existingText = currentSegment?.targetText || '';
    handleSegmentUpdate(selectedSegmentId, { targetText: existingText + lyric.text });
  };

  // 标记变化时更新片段
  useEffect(() => {
    const sortedMarkers = [...markers].sort((a, b) => a.time - b.time);
    const newSegments: Segment[] = [];

    // 从 0 开始创建片段
    let prevTime = 0;
    for (let i = 0; i < sortedMarkers.length; i++) {
      const marker = sortedMarkers[i];
      if (marker.time > prevTime) {
        // 查找已存在的片段以保留数据
        const existingSegment = segments.find(
          s => Math.abs(s.start - prevTime) < 0.1 && Math.abs(s.end - marker.time) < 0.1
        );
        newSegments.push({
          id: existingSegment?.id || `segment-${Date.now()}-${i}`,
          start: prevTime,
          end: marker.time,
          originalText: existingSegment?.originalText,
          targetText: existingSegment?.targetText,
          fixedAudioUrl: existingSegment?.fixedAudioUrl,
          isFixed: existingSegment?.isFixed,
        });
      }
      prevTime = marker.time;
    }

    // 最后一个片段（如果有 duration）
    // 这里暂时不添加，因为我们不知道总时长

    setSegments(newSegments);
  }, [markers]);

  // 处理音频文件上传
  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAudioFile(file);
    setSelectedVocal('');
    setAudioUrl(URL.createObjectURL(file));
    setMarkers([]);
    setSegments([]);
    setSelectedSegmentId(null);

    // 上传到服务器
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/api/lyric-fix/upload-audio`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setAudioPath(data.path);
      }
    } catch (err) {
      console.error('上传音频失败', err);
    }
  };

  // 选择已分离的人声
  const handleSelectVocal = (path: string) => {
    if (!path) return;
    setSelectedVocal(path);
    setAudioPath(path);
    setAudioFile(null);
    setAudioUrl(`${API_BASE}/api/separate/file?path=${encodeURIComponent(path)}`);
    setMarkers([]);
    setSegments([]);
    setSelectedSegmentId(null);
  };

  // 更新片段
  const handleSegmentUpdate = useCallback((segmentId: string, updates: Partial<Segment>) => {
    setSegments(prev =>
      prev.map(s => (s.id === segmentId ? { ...s, ...updates } : s))
    );
    // 如果只是空更新，说明是点击选择
    if (Object.keys(updates).length === 0) {
      setSelectedSegmentId(segmentId);
    }
  }, []);

  // 选择片段
  const handleSegmentSelect = useCallback((segment: Segment | null) => {
    setSelectedSegmentId(segment?.id || null);
  }, []);

  // 播放原始片段
  const playSegment = useCallback((segment: Segment) => {
    if (!audioRef.current || !audioUrl) return;
    audioRef.current.src = audioUrl;
    audioRef.current.currentTime = segment.start;
    audioRef.current.play();

    // 到达结束位置暂停
    const checkEnd = setInterval(() => {
      if (audioRef.current && audioRef.current.currentTime >= segment.end) {
        audioRef.current.pause();
        clearInterval(checkEnd);
      }
    }, 50);
  }, [audioUrl]);

  // 播放修复后的片段
  const playFixedSegment = useCallback((segment: Segment) => {
    if (!audioRef.current || !segment.fixedAudioUrl) return;
    audioRef.current.src = segment.fixedAudioUrl;
    audioRef.current.play();
  }, []);

  // 导出合并音频
  const handleExport = async () => {
    if (!audioPath || segments.length === 0) {
      alert('请先加载音频并添加分割点');
      return;
    }

    setExporting(true);
    setExportResult(null);

    try {
      // 提取修复音频的路径
      const segmentInfos = segments.map(seg => {
      // 从 URL 中提取路径，根据 useFixed 决定是否使用修复音频
        let fixedPath: string | undefined;
        const useFixed = seg.isFixed && seg.useFixed !== false;
        if (useFixed && seg.fixedAudioUrl) {
          const match = seg.fixedAudioUrl.match(/path=([^&]+)/);
          if (match) {
            fixedPath = decodeURIComponent(match[1]);
          }
        }
        return {
          start: seg.start,
          end: seg.end,
          fixed_audio_path: fixedPath,
        };
      });

      const res = await fetch(`${API_BASE}/api/lyric-fix/merge-segments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_path: audioPath,
          segments: segmentInfos,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setExportResult({ success: true, path: data.output_path });
      } else {
        setExportResult({ success: false, error: data.error });
      }
    } catch (err) {
      console.error('导出失败', err);
      setExportResult({ success: false, error: '导出失败' });
    } finally {
      setExporting(false);
    }
  };

  // 下载导出结果
  const handleDownload = () => {
    if (exportResult?.path) {
      window.open(`${API_BASE}/api/lyric-fix/file?path=${encodeURIComponent(exportResult.path)}`, '_blank');
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Music className="w-6 h-6" />
            音轨编辑器
            {projectName && <span className="text-base font-normal text-zinc-500">- {projectName}</span>}
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-1">
            可视化编辑音频片段，手动识别和修复歌词
          </p>
        </div>
        {/* 工程按钮 */}
        <div className="flex items-center gap-2">
          <button
            onClick={saveProject}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded text-sm"
          >
            <Save className="w-4 h-4" />
            保存
          </button>
          <div className="relative">
            <button
              onClick={() => setShowProjectList(!showProjectList)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm"
            >
              <FolderOpen className="w-4 h-4" />
              打开
            </button>
            {showProjectList && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 z-50">
                <div className="p-2 border-b border-zinc-200 dark:border-zinc-700">
                  <span className="text-sm font-medium">工程列表</span>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {projects.length === 0 ? (
                    <div className="p-4 text-center text-sm text-zinc-400">暂无已保存的工程</div>
                  ) : (
                    projects.map((proj) => (
                      <div key={proj.name} className="flex items-center justify-between px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-700">
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => loadProject(proj.name)}>
                          <div className="text-sm font-medium truncate">{proj.name.replace('track_', '')}</div>
                          <div className="text-xs text-zinc-400">
                            {proj.updated_at ? new Date(proj.updated_at * 1000).toLocaleString() : ''}
                          </div>
                        </div>
                        <button onClick={() => deleteProject(proj.name)} className="p-1 text-zinc-400 hover:text-red-500">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-6 gap-4">
        {/* 左侧：音频选择和设置 */}
        <div className="space-y-4">
          {/* 音频上传 */}
          <div className="bg-white dark:bg-zinc-800 rounded-lg shadow p-4">
            <h3 className="font-medium mb-3 flex items-center gap-2">
              <Music className="w-4 h-4" />
              人声音频
            </h3>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleAudioUpload}
              accept=".wav,.mp3,.flac"
              className="hidden"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-zinc-300 dark:border-zinc-600 rounded-lg p-4 hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
            >
              <Upload className="w-6 h-6 mx-auto mb-2 text-zinc-400" />
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {audioFile ? audioFile.name : '点击上传人声音频'}
              </span>
            </button>

            {/* 或选择已分离的人声 */}
            {separations.length > 0 && (
              <div className="mt-4">
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-2">或选择已分离的人声：</p>
                <select
                  value={selectedVocal}
                  onChange={(e) => handleSelectVocal(e.target.value)}
                  className="w-full border border-zinc-300 dark:border-zinc-600 rounded px-3 py-2 text-sm bg-white dark:bg-zinc-700 dark:text-zinc-100"
                >
                  <option value="">选择人声文件</option>
                  {separations.map((sep) =>
                    (sep.stems || [])
                      .filter((stem) => stem.name.includes('vocal'))
                      .map((stem) => (
                        <option key={stem.path} value={stem.path}>
                          {sep.track} - {stem.name}
                        </option>
                      ))
                  )}
                </select>
              </div>
            )}
          </div>

          {/* LRC 歌词导入 */}
          <div className="bg-white dark:bg-zinc-800 rounded-lg shadow p-4">
            <h3 className="font-medium mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              歌词 (LRC)
            </h3>
            <input
              type="file"
              ref={lrcInputRef}
              onChange={handleLrcUpload}
              accept=".lrc"
              className="hidden"
            />
            <button
              onClick={() => lrcInputRef.current?.click()}
              className="w-full border-2 border-dashed border-zinc-300 dark:border-zinc-600 rounded-lg p-3 hover:border-blue-400 transition-colors text-sm"
            >
              <FileText className="w-5 h-5 mx-auto mb-1 text-zinc-400" />
              {lyrics.length > 0 ? `已加载 ${lyrics.length} 行` : '导入 LRC 歌词'}
            </button>
            {/* 歌词列表 */}
            {lyrics.length > 0 && (
              <div className="mt-3 max-h-48 overflow-y-auto space-y-1">
                {lyrics.map((lyric, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded cursor-pointer group"
                    onClick={() => fillLyricToSegment(lyric)}
                  >
                    <span className="text-zinc-400 w-8">{idx + 1}</span>
                    <span className="flex-1 truncate">{lyric.text}</span>
                    <ArrowRight className="w-3 h-3 text-zinc-400 opacity-0 group-hover:opacity-100" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 语言选择 */}
          <div className="bg-white dark:bg-zinc-800 rounded-lg shadow p-4">
            <h3 className="font-medium mb-3">语言</h3>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={language === 'zh'}
                  onChange={() => setLanguage('zh')}
                />
                中文
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={language === 'en'}
                  onChange={() => setLanguage('en')}
                />
                English
              </label>
            </div>
          </div>

          {/* Vevo 高级参数 */}
          <div className="bg-white dark:bg-zinc-800 rounded-lg shadow p-4">
            <h3 className="font-medium mb-3">修复参数</h3>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-zinc-500">FM步数</label>
                  <span className="text-xs font-mono">{flowMatchingSteps}</span>
                </div>
                <input
                  type="range"
                  min="16"
                  max="64"
                  step="8"
                  value={flowMatchingSteps}
                  onChange={(e) => setFlowMatchingSteps(Number(e.target.value))}
                  className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-zinc-400">
                  <span>快</span>
                  <span>精细</span>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-zinc-500">时长比例</label>
                  <span className="text-xs font-mono">{durationRatio.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={durationRatio}
                  onChange={(e) => setDurationRatio(Number(e.target.value))}
                  className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">采样率</label>
                <select
                  value={targetSampleRate}
                  onChange={(e) => setTargetSampleRate(Number(e.target.value))}
                  className="w-full border border-zinc-300 dark:border-zinc-600 rounded px-2 py-1 text-sm bg-white dark:bg-zinc-700"
                >
                  <option value={24000}>24 kHz</option>
                  <option value={44100}>44.1 kHz</option>
                  <option value={48000}>48 kHz</option>
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-zinc-500">响度</label>
                  <span className="text-xs font-mono">{targetDb}dB</span>
                </div>
                <input
                  type="range"
                  min="-30"
                  max="-15"
                  step="1"
                  value={targetDb}
                  onChange={(e) => setTargetDb(Number(e.target.value))}
                  className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* 导出按钮 */}
          <div className="bg-white dark:bg-zinc-800 rounded-lg shadow p-4">
            <h3 className="font-medium mb-3">导出</h3>
            <button
              onClick={handleExport}
              disabled={exporting || segments.length === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded font-medium disabled:bg-zinc-300 disabled:cursor-not-allowed"
            >
              {exporting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  导出中...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  导出合并音频
                </>
              )}
            </button>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
              将所有片段（包括修复的）合并为完整音频
            </p>

            {exportResult && (
              <div className={`mt-3 p-3 rounded ${exportResult.success ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                {exportResult.success ? (
                  <>
                    <p className="text-sm text-green-700 dark:text-green-400 mb-2">导出成功！</p>
                    <button
                      onClick={handleDownload}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-green-500 hover:bg-green-600 text-white rounded text-sm"
                    >
                      <Download className="w-4 h-4" />
                      下载音频
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-red-700 dark:text-red-400">{exportResult.error}</p>
                )}
              </div>
            )}
          </div>

          {/* 统计信息 */}
          <div className="bg-white dark:bg-zinc-800 rounded-lg shadow p-4">
            <h3 className="font-medium mb-3">统计</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">分割点</span>
                <span>{markers.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">片段数</span>
                <span>{segments.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">已修复</span>
                <span className="text-green-600 dark:text-green-400">
                  {segments.filter(s => s.isFixed).length}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 右侧：音轨编辑器和片段编辑 */}
        <div className="lg:col-span-5 space-y-4">
          {audioUrl ? (
            <>
              {/* 音轨编辑器 */}
              <TrackEditor
                audioUrl={audioUrl}
                markers={markers}
                onMarkersChange={setMarkers}
                selectedSegmentId={selectedSegmentId}
                onSegmentSelect={handleSegmentSelect}
                segments={segments}
                onSegmentUpdate={handleSegmentUpdate}
              />

              {/* 片段编辑器 */}
              <SegmentList
                segments={segments}
                selectedSegmentId={selectedSegmentId}
                audioPath={audioPath}
                language={language}
                onSegmentUpdate={handleSegmentUpdate}
                onPlaySegment={playSegment}
                onPlayFixedSegment={playFixedSegment}
                flowMatchingSteps={flowMatchingSteps}
                durationRatio={durationRatio}
                targetSampleRate={targetSampleRate}
                targetDb={targetDb}
              />
            </>
          ) : (
            <div className="bg-white dark:bg-zinc-800 rounded-lg shadow p-12 text-center">
              <Music className="w-16 h-16 mx-auto mb-4 text-zinc-300 dark:text-zinc-600" />
              <p className="text-zinc-500 dark:text-zinc-400">
                请先上传或选择人声音频
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 隐藏的音频播放器 */}
      <audio ref={audioRef} className="hidden" />
    </div>
  );
}
