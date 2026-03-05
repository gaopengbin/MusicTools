import { useState } from 'react';
import { Play, Mic, Edit3, Check, Loader2, Volume2 } from 'lucide-react';
import type { Segment } from './TrackEditor';
import { API_BASE } from '../api/index';

interface SegmentListProps {
  segments: Segment[];
  selectedSegmentId: string | null;
  audioPath: string;
  language: 'zh' | 'en';
  onSegmentUpdate: (segmentId: string, updates: Partial<Segment>) => void;
  onPlaySegment: (segment: Segment) => void;
  onPlayFixedSegment: (segment: Segment) => void;
  flowMatchingSteps: number;
  durationRatio: number;
  targetSampleRate: number;
  targetDb: number;
}

export default function SegmentList({
  segments,
  selectedSegmentId,
  audioPath,
  language,
  onSegmentUpdate,
  onPlaySegment,
  onPlayFixedSegment,
  flowMatchingSteps,
  durationRatio,
  targetSampleRate,
  targetDb,
}: SegmentListProps) {
  const [recognizingId, setRecognizingId] = useState<string | null>(null);
  const [fixingId, setFixingId] = useState<string | null>(null);

  // 格式化时间
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  // 识别片段
  const handleRecognize = async (segment: Segment) => {
    if (!audioPath) {
      alert('请先加载音频');
      return;
    }

    setRecognizingId(segment.id);

    try {
      const res = await fetch(`${API_BASE}/api/lyric-fix/recognize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_path: audioPath,
          start_time: segment.start,
          end_time: segment.end,
          language,
        }),
      });
      const data = await res.json();

      if (data.success && data.text) {
        onSegmentUpdate(segment.id, { originalText: data.text });
      } else {
        alert(data.error || '识别失败');
      }
    } catch (err) {
      console.error('识别失败', err);
      alert('识别失败');
    } finally {
      setRecognizingId(null);
    }
  };

  // 修复片段
  const handleFix = async (segment: Segment) => {
    if (!audioPath) {
      alert('请先加载音频');
      return;
    }
    if (!segment.originalText?.trim()) {
      alert('请先识别或填写原歌词');
      return;
    }
    if (!segment.targetText?.trim()) {
      alert('请填写正确的歌词');
      return;
    }

    setFixingId(segment.id);

    try {
      const res = await fetch(`${API_BASE}/api/lyric-fix/fix-single`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_path: audioPath,
          start_time: segment.start,
          end_time: segment.end,
          original_text: segment.originalText,
          target_text: segment.targetText,
          language,
          flow_matching_steps: flowMatchingSteps,
          duration_ratio: durationRatio,
          target_sample_rate: targetSampleRate,
          target_db: targetDb,
        }),
      });
      const data = await res.json();

      if (data.success && data.output_path) {
        const audioUrl = `${API_BASE}/api/lyric-fix/file?path=${encodeURIComponent(data.output_path)}`;
        onSegmentUpdate(segment.id, {
          fixedAudioUrl: audioUrl,
          isFixed: true,
        });
      } else {
        alert(data.error || '修复失败');
      }
    } catch (err) {
      console.error('修复失败', err);
      alert('修复失败');
    } finally {
      setFixingId(null);
    }
  };

  const selectedSegment = segments.find(s => s.id === selectedSegmentId);

  if (!selectedSegment) {
    return (
      <div className="bg-white dark:bg-zinc-800 rounded-lg shadow p-6 text-center text-zinc-400">
        选择一个片段进行编辑
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-zinc-800 rounded-lg shadow">
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-700">
        <h3 className="font-medium">
          片段编辑 - {formatTime(selectedSegment.start)} ~ {formatTime(selectedSegment.end)}
        </h3>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          时长: {formatTime(selectedSegment.end - selectedSegment.start)}
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* 试听按钮 */}
        <div className="flex gap-2">
          <button
            onClick={() => onPlaySegment(selectedSegment)}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 rounded"
          >
            <Play className="w-4 h-4" />
            试听原音
          </button>
          {selectedSegment.isFixed && selectedSegment.fixedAudioUrl && (
            <button
              onClick={() => onPlayFixedSegment(selectedSegment)}
              className="flex items-center gap-2 px-4 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 rounded"
            >
              <Volume2 className="w-4 h-4" />
              试听修复
            </button>
          )}
        </div>

        {/* 原歌词（Suno 唱的） */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium">原歌词（Suno 唱的）</label>
            <button
              onClick={() => handleRecognize(selectedSegment)}
              disabled={recognizingId === selectedSegment.id}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 rounded disabled:opacity-50"
            >
              {recognizingId === selectedSegment.id ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  识别中...
                </>
              ) : (
                <>
                  <Mic className="w-3 h-3" />
                  自动识别
                </>
              )}
            </button>
          </div>
          <input
            type="text"
            value={selectedSegment.originalText || ''}
            onChange={(e) => onSegmentUpdate(selectedSegment.id, { originalText: e.target.value })}
            placeholder="输入或识别 Suno 实际唱的内容"
            className="w-full border border-zinc-300 dark:border-zinc-600 rounded px-3 py-2 bg-white dark:bg-zinc-700 dark:text-zinc-100"
          />
        </div>

        {/* 正确歌词 */}
        <div>
          <label className="text-sm font-medium mb-2 block">正确歌词</label>
          <input
            type="text"
            value={selectedSegment.targetText || ''}
            onChange={(e) => onSegmentUpdate(selectedSegment.id, { targetText: e.target.value })}
            placeholder="输入正确的歌词"
            className="w-full border border-zinc-300 dark:border-zinc-600 rounded px-3 py-2 bg-white dark:bg-zinc-700 dark:text-zinc-100"
          />
        </div>

        {/* 修复按钮 */}
        <button
          onClick={() => handleFix(selectedSegment)}
          disabled={fixingId === selectedSegment.id || !selectedSegment.originalText?.trim() || !selectedSegment.targetText?.trim()}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded font-medium disabled:bg-zinc-300 disabled:cursor-not-allowed"
        >
          {fixingId === selectedSegment.id ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              修复中...
            </>
          ) : (
            <>
              <Edit3 className="w-5 h-5" />
              修复此片段
            </>
          )}
        </button>

        {/* 修复状态 */}
        {selectedSegment.isFixed && (
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded">
            <Check className="w-5 h-5" />
            已修复
          </div>
        )}
      </div>

      {/* 所有片段列表 */}
      <div className="border-t border-zinc-200 dark:border-zinc-700 p-4">
        <h4 className="text-sm font-medium mb-3">全部片段</h4>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {segments.map((segment, index) => (
            <div
              key={segment.id}
              className={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer transition-colors ${
                segment.id === selectedSegmentId
                  ? 'bg-blue-100 dark:bg-blue-900/30'
                  : 'hover:bg-zinc-100 dark:hover:bg-zinc-700'
              }`}
              onClick={() => onSegmentUpdate(segment.id, {})} // Just to trigger selection
            >
              <span className="text-sm font-medium w-8">#{index + 1}</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 w-24">
                {formatTime(segment.start)} - {formatTime(segment.end)}
              </span>
              <span className="flex-1 text-sm truncate">
                {segment.targetText || segment.originalText || '-'}
              </span>
              {segment.isFixed && (
                <Check className="w-4 h-4 text-green-500" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
