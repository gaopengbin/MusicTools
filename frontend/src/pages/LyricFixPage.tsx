import { useState, useEffect, useRef } from 'react';
import { 
  Upload, FileText, Loader2, CheckCircle, AlertCircle, 
  Download, Music, Edit3, Save, FolderOpen, Trash2 
} from 'lucide-react';
import { separateApi, type SeparationResult, API_BASE } from '../api/index';

// 歌词行类型
interface LyricLine {
  index: number;
  start_time: string;
  end_time: string;
  start_seconds: number;
  end_seconds: number;
  text: string;
  // 本地状态
  selected?: boolean;
  editedText?: string;  // 编辑后的原歌词（Suno 实际唱的）
  fixedText?: string;   // 目标歌词（正确的）
  mergedWith?: number[]; // 合并的行索引
  isMergedChild?: boolean; // 是否是被合并的子行
}

// 任务进度类型
interface TaskProgress {
  status: string;
  progress: number;
  message?: string;
  error?: string;
  output_path?: string;
  fixed_count?: number;
}

// 工程类型
interface Project {
  name: string;
  path: string;
  created_at?: number;
  updated_at?: number;
  audio_path?: string;
}

export default function LyricFixPage() {
  // 状态
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioPath, setAudioPath] = useState<string>('');
  const [lrcContent, setLrcContent] = useState<string>('');
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [, setTaskId] = useState<string | null>(null);
  const [progress, setProgress] = useState<TaskProgress | null>(null);
  const [result, setResult] = useState<{ success: boolean; message: string; path?: string } | null>(null);
  const [separations, setSeparations] = useState<SeparationResult[]>([]);
  const [selectedVocal, setSelectedVocal] = useState<string>('');
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const [timeOffset, setTimeOffset] = useState<number>(0); // 时间偏移（秒）
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lrcInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [fixingIndex, setFixingIndex] = useState<number | null>(null); // 正在单句修复的行
  const [fixedAudioUrls, setFixedAudioUrls] = useState<Record<number, string>>({}); // 已修复的音频URL
  const [recognizingIndex, setRecognizingIndex] = useState<number | null>(null); // 正在识别的行
  
  // 工程相关状态
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectName, setProjectName] = useState<string>('');
  const [showProjectList, setShowProjectList] = useState(false);

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
      setProjects(data);
    } catch (err) {
      console.error('加载工程列表失败', err);
    }
  };

  // 保存工程
  const saveProject = async () => {
    if (!projectName.trim()) {
      const name = prompt('请输入工程名称', '歌词修复工程');
      if (!name) return;
      setProjectName(name);
    }
    
    const name = projectName.trim() || '歌词修复工程';
    
    try {
      const res = await fetch(`${API_BASE}/api/lyric-fix/project/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          audio_path: audioPath,
          lrc_content: lrcContent,
          lyrics,
          language,
          time_offset: timeOffset,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setProjectName(data.name);
        loadProjects();
        alert('工程已保存');
      }
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
      
      setProjectName(data.name);
      setAudioPath(data.audio_path || '');
      setLrcContent(data.lrc_content || '');
      setLyrics(data.lyrics || []);
      setLanguage(data.language || 'zh');
      setTimeOffset(data.time_offset || 0);
      setShowProjectList(false);
      setFixedAudioUrls({});
      
      // 如果音频路径是分离结果，设置 selectedVocal
      if (data.audio_path?.includes('htdemucs')) {
        setSelectedVocal(data.audio_path);
        setAudioFile(null);
      }
    } catch (err) {
      console.error('加载工程失败', err);
      alert('加载失败');
    }
  };

  // 删除工程
  const deleteProject = async (name: string) => {
    if (!confirm(`确定要删除工程「${name}」吗？`)) return;
    
    try {
      await fetch(`${API_BASE}/api/lyric-fix/project/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });
      loadProjects();
    } catch (err) {
      console.error('删除工程失败', err);
    }
  };

  // 处理音频文件上传
  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setAudioFile(file);
    setSelectedVocal('');
    
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
    setSelectedVocal(path);
    setAudioPath(path);
    setAudioFile(null);
  };

  // 处理 LRC 文件上传
  const handleLrcUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const text = await file.text();
    setLrcContent(text);
    await parseLrc(text);
  };

  // 解析 LRC
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
        setLyrics(data.lines.map((line: LyricLine) => ({
          ...line,
          selected: false,
          fixedText: '',
        })));
      }
    } catch (err) {
      console.error('解析歌词失败', err);
    }
  };

  // 切换选中状态
  const toggleSelect = (index: number) => {
    setLyrics(lyrics.map((line, i) => 
      i === index ? { ...line, selected: !line.selected } : line
    ));
  };

  // 更新原歌词（Suno 实际唱的）
  const updateEditedText = (index: number, text: string) => {
    setLyrics(lyrics.map((line, i) => 
      i === index ? { ...line, editedText: text } : line
    ));
  };

  // 更新目标歌词（正确的）
  const updateFixedText = (index: number, text: string) => {
    setLyrics(lyrics.map((line, i) => 
      i === index ? { ...line, fixedText: text } : line
    ));
  };

  // 合并选中的相邻行
  const mergeSelected = () => {
    const selectedIndices = lyrics
      .map((line, i) => line.selected ? i : -1)
      .filter(i => i !== -1)
      .sort((a, b) => a - b);
    
    if (selectedIndices.length < 2) {
      alert('请至少选择两行进行合并');
      return;
    }
    
    // 检查是否连续
    for (let i = 1; i < selectedIndices.length; i++) {
      if (selectedIndices[i] - selectedIndices[i-1] !== 1) {
        alert('只能合并相邻的行');
        return;
      }
    }
    
    const firstIdx = selectedIndices[0];
    const lastIdx = selectedIndices[selectedIndices.length - 1];
    
    setLyrics(lyrics.map((line, i) => {
      if (i === firstIdx) {
        // 第一行成为合并后的主行
        const mergedText = selectedIndices.map(idx => lyrics[idx].text).join('');
        const lastLine = lyrics[lastIdx];
        return {
          ...line,
          text: mergedText,
          end_time: lastLine.end_time,
          end_seconds: lastLine.end_seconds,
          mergedWith: selectedIndices.slice(1),
          selected: true,
          fixedText: line.fixedText || '',
        };
      } else if (selectedIndices.includes(i) && i !== firstIdx) {
        // 其他被合并的行标记为子行
        return { ...line, isMergedChild: true, selected: false };
      }
      return line;
    }));
  };

  // 取消合并
  const unmerge = (index: number) => {
    const line = lyrics[index];
    if (!line.mergedWith || line.mergedWith.length === 0) return;
    
    // 重新解析歌词恢复原始状态
    parseLrc(lrcContent);
  };

  // 一键填充原歌词到修改栏
  const fillOriginalLyrics = () => {
    setLyrics(lyrics.map(line => 
      line.selected ? { ...line, fixedText: line.text } : line
    ));
  };

  // 语音识别
  const recognizeLine = async (lineIndex: number) => {
    const line = lyrics[lineIndex];
    if (!audioPath) {
      alert('请先上传音频');
      return;
    }

    setRecognizingIndex(lineIndex);

    try {
      const res = await fetch(`${API_BASE}/api/lyric-fix/recognize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_path: audioPath,
          start_time: getAdjustedTime(line.start_seconds),
          end_time: getAdjustedTime(line.end_seconds),
          language,
        }),
      });
      const data = await res.json();
      
      if (data.success && data.text) {
        // 填充识别结果到原歌词栏
        updateEditedText(lineIndex, data.text);
      } else {
        alert(data.error || '识别失败');
      }
    } catch (err) {
      console.error('语音识别失败', err);
      alert('识别失败');
    } finally {
      setRecognizingIndex(null);
    }
  };

  // 单句修复
  const fixSingleLine = async (lineIndex: number) => {
    const line = lyrics[lineIndex];
    if (!line.fixedText?.trim()) {
      alert('请先填写修改后的歌词');
      return;
    }
    if (!audioPath) {
      alert('请先上传音频');
      return;
    }

    setFixingIndex(lineIndex);

    try {
      const res = await fetch(`${API_BASE}/api/lyric-fix/fix-single`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_path: audioPath,
          start_time: getAdjustedTime(line.start_seconds),
          end_time: getAdjustedTime(line.end_seconds),
          original_text: line.editedText ?? line.text,  // Suno实际唱的
          target_text: line.fixedText,  // 正确的歌词
          language,
        }),
      });
      const data = await res.json();
      
      if (data.success && data.output_path) {
        // 保存修复后的音频URL
        const audioUrl = `${API_BASE}/api/lyric-fix/file?path=${encodeURIComponent(data.output_path)}`;
        setFixedAudioUrls(prev => ({ ...prev, [lineIndex]: audioUrl }));
      } else {
        alert(data.error || '修复失败');
      }
    } catch (err) {
      console.error('单句修复失败', err);
      alert('单句修复失败');
    } finally {
      setFixingIndex(null);
    }
  };

  // 播放修复后的音频
  const playFixedAudio = (lineIndex: number) => {
    const url = fixedAudioUrls[lineIndex];
    if (!url || !audioRef.current) return;
    
    if (playingIndex === lineIndex) {
      audioRef.current.pause();
      setPlayingIndex(null);
    } else {
      audioRef.current.src = url;
      audioRef.current.play();
      setPlayingIndex(lineIndex);
    }
  };

  // 开始修复
  const handleStartFix = async () => {
    if (!audioPath) {
      setResult({ success: false, message: '请先上传音频或选择已分离的人声' });
      return;
    }
    
    const tasks = lyrics
      .filter(line => line.selected && line.fixedText?.trim())
      .map(line => ({
        line_index: line.index,
        original_text: line.editedText ?? line.text,  // Suno实际唱的
        target_text: line.fixedText!,  // 正确的歌词
      }));
    
    if (tasks.length === 0) {
      setResult({ success: false, message: '请选择要修复的歌词并填写修改内容' });
      return;
    }
    
    setLoading(true);
    setResult(null);
    setProgress(null);
    
    try {
      const res = await fetch(`${API_BASE}/api/lyric-fix/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_path: audioPath,
          lrc_content: lrcContent,
          tasks,
          language,
          time_offset: timeOffset,
        }),
      });
      const data = await res.json();
      setTaskId(data.task_id);
      
      // 轮询进度
      const timer = setInterval(async () => {
        try {
          const pr = await fetch(`${API_BASE}/api/lyric-fix/progress/${data.task_id}`);
          const prog: TaskProgress = await pr.json();
          setProgress(prog);
          
          if (prog.status === 'done') {
            clearInterval(timer);
            setLoading(false);
            setResult({
              success: true,
              message: `修复完成！共修复 ${prog.fixed_count} 处`,
              path: prog.output_path,
            });
          } else if (prog.status === 'error') {
            clearInterval(timer);
            setLoading(false);
            setResult({ success: false, message: prog.error || '修复失败' });
          }
        } catch (err) {
          console.error('获取进度失败', err);
        }
      }, 1000);
    } catch (err) {
      setLoading(false);
      setResult({ success: false, message: '启动任务失败' });
    }
  };

  // 获取调整后的时间
  const getAdjustedTime = (seconds: number) => {
    return Math.max(0, seconds + timeOffset);
  };

  // 播放片段
  const playSegment = (line: LyricLine) => {
    if (!audioPath || !audioRef.current) return;
    
    if (playingIndex === line.index) {
      audioRef.current.pause();
      setPlayingIndex(null);
    } else {
      // 使用已上传的音频或选中的人声
      const url = audioFile 
        ? URL.createObjectURL(audioFile)
        : `${API_BASE}/api/separate/file?path=${encodeURIComponent(audioPath)}`;
      
      audioRef.current.src = url;
      audioRef.current.currentTime = getAdjustedTime(line.start_seconds);
      audioRef.current.play();
      setPlayingIndex(line.index);
      
      // 到达结束时间后暂停
      const adjustedEnd = getAdjustedTime(line.end_seconds);
      const checkEnd = setInterval(() => {
        if (audioRef.current && audioRef.current.currentTime >= adjustedEnd) {
          audioRef.current.pause();
          setPlayingIndex(null);
          clearInterval(checkEnd);
        }
      }, 100);
    }
  };

  // 下载结果
  const handleDownload = () => {
    if (result?.path) {
      window.open(`${API_BASE}/api/lyric-fix/file?path=${encodeURIComponent(result.path)}`, '_blank');
    }
  };

  // 获取已选中需要修复的数量
  const selectedCount = lyrics.filter(l => l.selected && l.fixedText?.trim()).length;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Edit3 className="w-6 h-6" />
            歌词修复
            {projectName && (
              <span className="text-base font-normal text-zinc-500 dark:text-zinc-400">
                - {projectName}
              </span>
            )}
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-1">
            修复 Suno AI 生成歌曲中的中文发音错误，基于 Vevo 1.5 语音编辑技术
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={saveProject}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded text-sm"
            title="保存工程"
          >
            <Save className="w-4 h-4" />
            保存
          </button>
          <div className="relative">
            <button
              onClick={() => setShowProjectList(!showProjectList)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm"
              title="打开工程"
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
                    <div className="p-4 text-center text-sm text-zinc-400">
                      暂无已保存的工程
                    </div>
                  ) : (
                    projects.map((proj) => (
                      <div
                        key={proj.name}
                        className="flex items-center justify-between px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 cursor-pointer"
                      >
                        <div
                          className="flex-1 min-w-0"
                          onClick={() => loadProject(proj.name)}
                        >
                          <div className="text-sm font-medium truncate">{proj.name}</div>
                          <div className="text-xs text-zinc-400 truncate">
                            {proj.updated_at ? new Date(proj.updated_at * 1000).toLocaleString() : ''}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteProject(proj.name);
                          }}
                          className="p-1 text-zinc-400 hover:text-red-500"
                          title="删除"
                        >
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* 左侧：上传区域 */}
        <div className="lg:col-span-1 space-y-4">
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

          {/* LRC 上传 */}
          <div className="bg-white dark:bg-zinc-800 rounded-lg shadow p-4">
            <h3 className="font-medium mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              歌词文件 (LRC)
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
              className="w-full border-2 border-dashed border-zinc-300 dark:border-zinc-600 rounded-lg p-4 hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
            >
              <FileText className="w-6 h-6 mx-auto mb-2 text-zinc-400" />
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {lrcContent ? `已加载 ${lyrics.length} 行歌词` : '点击上传 LRC 文件'}
              </span>
            </button>
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

          {/* 时间偏移调整 */}
          <div className="bg-white dark:bg-zinc-800 rounded-lg shadow p-4">
            <h3 className="font-medium mb-3">歌词时间偏移</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
              如果歌词和音频不同步，调整此值（正数=歌词提前，负数=歌词延后）
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTimeOffset(prev => prev - 0.5)}
                className="px-3 py-1 bg-zinc-200 dark:bg-zinc-600 rounded hover:bg-zinc-300 dark:hover:bg-zinc-500"
              >
                -0.5s
              </button>
              <input
                type="number"
                value={timeOffset}
                onChange={(e) => setTimeOffset(parseFloat(e.target.value) || 0)}
                step="0.1"
                className="w-20 text-center border border-zinc-300 dark:border-zinc-600 rounded px-2 py-1 bg-white dark:bg-zinc-700 dark:text-zinc-100"
              />
              <span className="text-sm text-zinc-500">秒</span>
              <button
                onClick={() => setTimeOffset(prev => prev + 0.5)}
                className="px-3 py-1 bg-zinc-200 dark:bg-zinc-600 rounded hover:bg-zinc-300 dark:hover:bg-zinc-500"
              >
                +0.5s
              </button>
              <button
                onClick={() => setTimeOffset(0)}
                className="px-2 py-1 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                重置
              </button>
            </div>
          </div>

          {/* 开始修复按钮 */}
          <button
            onClick={handleStartFix}
            disabled={loading || !audioPath || selectedCount === 0}
            className="w-full bg-blue-500 text-white py-3 rounded-lg font-medium hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                修复中...
              </>
            ) : (
              <>
                <Edit3 className="w-5 h-5" />
                开始修复 ({selectedCount} 处)
              </>
            )}
          </button>

          {/* 进度显示 */}
          {progress && (
            <div className="bg-white dark:bg-zinc-800 rounded-lg shadow p-4">
              <div className="flex justify-between text-sm mb-2">
                <span>{progress.message || '处理中...'}</span>
                <span>{Math.round(progress.progress)}%</span>
              </div>
              <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: `${progress.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* 结果显示 */}
          {result && (
            <div className={`rounded-lg shadow p-4 ${result.success ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className="flex items-center gap-2 mb-2">
                {result.success ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-500" />
                )}
                <span className={result.success ? 'text-green-700' : 'text-red-700'}>
                  {result.message}
                </span>
              </div>
              {result.success && result.path && (
                <button
                  onClick={handleDownload}
                  className="w-full mt-2 bg-green-500 text-white py-2 rounded flex items-center justify-center gap-2 hover:bg-green-600"
                >
                  <Download className="w-4 h-4" />
                  下载修复后的音频
                </button>
              )}
            </div>
          )}
        </div>

        {/* 右侧：歌词编辑区域 */}
        <div className="lg:col-span-3">
          <div className="bg-white dark:bg-zinc-800 rounded-lg shadow">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-700">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">歌词列表</h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                    勾选需要修改的行，在右侧输入正确的歌词
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={fillOriginalLyrics}
                    className="px-3 py-1.5 text-sm bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 rounded transition-colors"
                    title="将选中行的原歌词填充到修改栏"
                  >
                    填充原词
                  </button>
                  <button
                    onClick={mergeSelected}
                    className="px-3 py-1.5 text-sm bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 rounded transition-colors"
                    title="将选中的相邻行合并为一行"
                  >
                    合并选中行
                  </button>
                </div>
              </div>
            </div>
            
            <div className="max-h-[600px] overflow-y-auto">
              {lyrics.length === 0 ? (
                <div className="p-8 text-center text-zinc-400">
                  请先上传 LRC 歌词文件
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-zinc-50 dark:bg-zinc-700 sticky top-0">
                    <tr>
                      <th className="w-10 px-3 py-2"></th>
                      <th className="w-24 px-3 py-2 text-left text-sm font-medium text-zinc-500 dark:text-zinc-400">时间</th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-zinc-500 dark:text-zinc-400">原歌词（Suno唱的）</th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-zinc-500 dark:text-zinc-400">修改为（正确的）</th>
                      <th className="w-56 px-3 py-2 text-left text-sm font-medium text-zinc-500 dark:text-zinc-400">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lyrics.map((line) => {
                      // 跳过被合并的子行
                      if (line.isMergedChild) return null;
                      
                      const isMerged = line.mergedWith && line.mergedWith.length > 0;
                      
                      return (
                        <tr
                          key={line.index}
                          className={`border-b border-zinc-100 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 ${line.selected ? 'bg-blue-50 dark:bg-blue-900/20' : ''} ${isMerged ? 'bg-amber-50 dark:bg-amber-900/20' : ''}`}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={line.selected || false}
                              onChange={() => toggleSelect(line.index)}
                              className="w-4 h-4"
                            />
                          </td>
                          <td className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400 font-mono">
                            <div>{line.start_time}</div>
                            {isMerged && (
                              <div className="text-xs text-amber-600 dark:text-amber-400">
                                ↳ {line.end_time}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-sm">
                            {line.selected ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={line.editedText ?? line.text}
                                  onChange={(e) => updateEditedText(line.index, e.target.value)}
                                  placeholder="Suno实际唱的"
                                  className="flex-1 border border-zinc-300 dark:border-zinc-600 rounded px-2 py-1 text-sm bg-white dark:bg-zinc-700 dark:text-zinc-100"
                                />
                                {isMerged && (
                                  <button
                                    onClick={() => unmerge(line.index)}
                                    className="text-xs text-amber-600 hover:text-amber-800 dark:text-amber-400 whitespace-nowrap"
                                    title="取消合并"
                                  >
                                    [拆分]
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-zinc-400">{line.text}</span>
                                {isMerged && (
                                  <button
                                    onClick={() => unmerge(line.index)}
                                    className="text-xs text-amber-600 hover:text-amber-800 dark:text-amber-400"
                                    title="取消合并"
                                  >
                                    [拆分]
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {line.selected && (
                              <input
                                type="text"
                                value={line.fixedText || ''}
                                onChange={(e) => updateFixedText(line.index, e.target.value)}
                                placeholder="输入正确的歌词"
                                className="w-full border border-zinc-300 dark:border-zinc-600 rounded px-2 py-1 text-sm bg-white dark:bg-zinc-700 dark:text-zinc-100"
                              />
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1 flex-wrap">
                              {/* 试听原音频 */}
                              <button
                                onClick={() => playSegment(line)}
                                className="px-2 py-0.5 text-xs bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600 rounded"
                                title="试听原音频"
                              >
                                ▶ 原音
                              </button>
                              
                              {/* 语音识别按钮 - 选中时显示 */}
                              {line.selected && (
                                <button
                                  onClick={() => recognizeLine(line.index)}
                                  disabled={recognizingIndex === line.index}
                                  className="px-2 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 rounded disabled:opacity-50"
                                  title="识别音频中的文字"
                                >
                                  {recognizingIndex === line.index ? '识别中...' : '识别'}
                                </button>
                              )}
                              
                              {/* 单句修复按钮 - 有修改内容时显示 */}
                              {line.selected && line.fixedText?.trim() && (
                                <button
                                  onClick={() => fixSingleLine(line.index)}
                                  disabled={fixingIndex === line.index}
                                  className="px-2 py-0.5 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-900/50 rounded disabled:opacity-50"
                                  title="执行修复（可重复）"
                                >
                                  {fixingIndex === line.index ? '修复中...' : '修复'}
                                </button>
                              )}
                              
                              {/* 播放已修复的音频 - 修复完成后显示 */}
                              {fixedAudioUrls[line.index] && (
                                <button
                                  onClick={() => playFixedAudio(line.index)}
                                  className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 rounded"
                                  title="播放修复后的音频"
                                >
                                  {playingIndex === line.index ? '⏸ 暂停' : '▶ 修复'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 隐藏的音频播放器 */}
      <audio ref={audioRef} className="hidden" />
    </div>
  );
}
