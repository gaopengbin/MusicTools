# -*- coding: utf-8 -*-
"""
歌词修复服务 - 基于 Vevo 1.5
用于修复 Suno AI 生成歌曲中的中文发音错误
"""

import os
import re
import sys
import asyncio
import subprocess
import tempfile
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Optional, Callable
from enum import Enum

from pydub import AudioSegment


# ==================== 数据结构 ====================

@dataclass
class LyricLine:
    """歌词行"""
    index: int
    start_time: float  # 秒
    end_time: float    # 秒
    text: str
    needs_fix: bool = False
    fixed_text: str = ""


@dataclass
class FixTask:
    """修复任务"""
    line_index: int
    original_text: str
    target_text: str


@dataclass 
class FixResult:
    """修复结果"""
    success: bool
    output_path: Optional[str] = None
    fixed_count: int = 0
    error: Optional[str] = None


# ==================== LRC 解析 ====================

def parse_lrc_time(time_str: str) -> float:
    """解析 LRC 时间标签，返回秒数"""
    match = re.match(r'(\d+):(\d+)[.:](\d+)', time_str)
    if match:
        minutes = int(match.group(1))
        seconds = int(match.group(2))
        centiseconds = int(match.group(3))
        return minutes * 60 + seconds + centiseconds / 100
    return 0.0


def parse_lrc(lrc_content: str) -> List[LyricLine]:
    """解析 LRC 文件内容"""
    lines = []
    raw_lines = []
    
    for line in lrc_content.strip().split('\n'):
        match = re.match(r'\[(\d+:\d+[.:]\d+)\](.*)', line)
        if match:
            time_str = match.group(1)
            text = match.group(2).strip()
            # 跳过空行和标记行（如【主歌1】）
            if text and not text.startswith('【'):
                start_time = parse_lrc_time(time_str)
                raw_lines.append((start_time, text))
    
    for i, (start_time, text) in enumerate(raw_lines):
        if i < len(raw_lines) - 1:
            end_time = raw_lines[i + 1][0]
        else:
            end_time = start_time + 5.0
        
        lines.append(LyricLine(
            index=i,
            start_time=start_time,
            end_time=end_time,
            text=text,
        ))
    
    return lines


def format_time(seconds: float) -> str:
    """格式化时间为 mm:ss.xx"""
    minutes = int(seconds // 60)
    secs = seconds % 60
    return f"{minutes:02d}:{secs:05.2f}"


# ==================== 音频处理 ====================

def split_audio_segment(
    audio_path: str,
    start_time: float,
    end_time: float,
    output_path: str,
    padding_ms: int = 100,
) -> str:
    """切分单个音频片段"""
    audio = AudioSegment.from_file(audio_path)
    
    start_ms = max(0, int(start_time * 1000) - padding_ms)
    end_ms = min(len(audio), int(end_time * 1000) + padding_ms)
    
    segment = audio[start_ms:end_ms]
    segment.export(output_path, format="wav")
    return output_path


def replace_audio_segment(
    original_audio_path: str,
    replacement_path: str,
    start_time: float,
    end_time: float,
    output_path: str,
) -> str:
    """替换原音频中的某个片段"""
    original = AudioSegment.from_file(original_audio_path)
    replacement = AudioSegment.from_file(replacement_path)
    
    start_ms = int(start_time * 1000)
    end_ms = int(end_time * 1000)
    
    # 构建新音频：前段 + 替换段 + 后段
    before = original[:start_ms]
    after = original[end_ms:]
    
    # 调整替换片段长度以匹配原始时长（可选，避免时间偏移）
    target_duration = end_ms - start_ms
    if len(replacement) != target_duration:
        # 简单处理：如果差异不大就用 crossfade，差异大就直接拼接
        pass
    
    result = before + replacement + after
    result.export(output_path, format="wav")
    return output_path


# ==================== Vevo 调用 ====================

# Vevo 1.5 安装路径
VEVO_PATH = Path("G:/AI/vevo-1.5/vevo-1.5")


class LyricFixer:
    """歌词修复器"""
    
    def __init__(
        self,
        vevo_path: Path = VEVO_PATH,
        output_dir: str = "outputs/lyric_fix",
    ):
        self.vevo_path = vevo_path
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Vevo Python 环境（如果有独立虚拟环境）
        self.vevo_python = vevo_path / "py39" / "python.exe"
        if not self.vevo_python.exists():
            self.vevo_python = sys.executable
    
    async def recognize_audio(
        self,
        audio_path: str,
        start_time: float,
        end_time: float,
        language: str = "zh",
    ) -> dict:
        """
        使用 SenseVoice 识别音频片段中的文字
        """
        import uuid
        
        work_dir = tempfile.mkdtemp(prefix="lyric_asr_")
        
        try:
            # 刹分片段（使用绝对路径）
            segment_path = os.path.join(work_dir, "segment.wav")
            audio_abs_path = os.path.abspath(audio_path)
            print(f"[ASR] audio_abs_path: {audio_abs_path}")
            print(f"[ASR] segment_path: {segment_path}")
            
            split_audio_segment(
                audio_abs_path,
                start_time,
                end_time,
                segment_path,
            )
            
            # 确保 segment_path 是绝对路径
            segment_abs_path = os.path.abspath(segment_path)
            print(f"[ASR] segment_abs_path: {segment_abs_path}")
            print(f"[ASR] segment exists: {os.path.exists(segment_abs_path)}")
            
            # 构建 ASR 脚本 - 使用 cy_app.prompt_wav_recognition
            script = f'''
import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, r"{self.vevo_path}")
import os
os.chdir(r"{self.vevo_path}")

import cy_app

# 识别音频
result = cy_app.prompt_wav_recognition(r"{segment_abs_path}")

if result and len(result) > 0:
    text = result[0].strip()
    print("RESULT:" + text)
else:
    print("RESULT:")
'''
            
            # 写入临时脚本
            with tempfile.NamedTemporaryFile(
                mode='w', suffix='.py', delete=False, encoding='utf-8'
            ) as f:
                f.write(script)
                script_path = f.name
            
            try:
                # 执行脚本
                def run_asr():
                    return subprocess.run(
                        [str(self.vevo_python), script_path],
                        capture_output=True,
                        cwd=str(self.vevo_path),
                        timeout=60,
                    )
                
                result = await asyncio.get_event_loop().run_in_executor(None, run_asr)
                
                stdout_str = result.stdout.decode('utf-8', errors='ignore')
                stderr_str = result.stderr.decode('utf-8', errors='ignore')
                
                print(f"[ASR] returncode: {result.returncode}")
                print(f"[ASR] stdout: {stdout_str[:1000]}")
                print(f"[ASR] stderr: {stderr_str[:1000]}")
                
                # 提取识别结果
                for line in stdout_str.split('\n'):
                    if line.startswith('RESULT:'):
                        text = line[7:].strip()
                        if text:
                            return {
                                "success": True,
                                "text": text,
                            }
                
                return {
                    "success": False,
                    "error": "未识别到语音内容",
                }
            finally:
                try:
                    os.unlink(script_path)
                except:
                    pass
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
            }
    
    async def fix_single_segment(
        self,
        audio_path: str,
        original_text: str,
        target_text: str,
        output_path: str,
        language: str = "zh",
        flow_matching_steps: int = 32,
        duration_ratio: float = 1.0,
        target_sample_rate: int = 24000,
        target_db: float = -25.0,
    ) -> bool:
        """
        使用 Vevo 修复单个音频片段
        通过子进程调用，避免环境冲突
        
        Args:
            flow_matching_steps: FM步数，越大质量越高但越慢 (16-64)
            duration_ratio: 时长比例，<1加速，>1减速 (0.5-2.0)
            target_sample_rate: 输出采样率 (24000/44100/48000)
            target_db: 目标响度 dB (-30 ~ -15)
        """
        # 构建调用脚本
        script = f'''
import sys
sys.path.insert(0, r"{self.vevo_path}")
import os
os.chdir(r"{self.vevo_path}")

# 初始化 espeak-ng 路径（必须在导入 phonemizer 之前）
import espeakng_loader
os.environ["PHONEMIZER_ESPEAK_LIBRARY"] = espeakng_loader.get_library_path()
os.environ["PHONEMIZER_ESPEAK_PATH"] = espeakng_loader.get_library_path()
os.environ["ESPEAK_DATA_PATH"] = espeakng_loader.get_data_path()

from models.svc.vevosing.vevosing_utils import load_wav, g2p_, save_audio
import models.svc.vevosing.infer_vevosing_ar as vevo_module
from models.svc.vevosing.infer_vevosing_ar import load_inference_pipeline

# 加载推理管道
inference_pipeline = load_inference_pipeline()

# 执行编辑 - 使用底层 API 以支持更多参数
gen_audio = inference_pipeline.inference_ar_and_fm(
    task="recognition-synthesis",
    src_wav_path=r"{audio_path}",
    src_text=r"""{target_text}""",
    style_ref_wav_path=r"{audio_path}",
    style_ref_wav_text=r"""{original_text}""",
    src_text_language="{language}",
    style_ref_wav_text_language="{language}",
    timbre_ref_wav_path=r"{audio_path}",
    use_style_tokens_as_ar_input=True,
    target_src_duration_ratio={duration_ratio},
    flow_matching_steps={flow_matching_steps},
)

save_audio(
    gen_audio, 
    output_path=r"{output_path}",
    target_sample_rate={target_sample_rate},
    target_db={target_db},
)
print("SUCCESS")
'''
        
        # 写入临时脚本
        with tempfile.NamedTemporaryFile(
            mode='w', suffix='.py', delete=False, encoding='utf-8'
        ) as f:
            f.write(script)
            script_path = f.name
        
        try:
            # 使用同步 subprocess.run 在线程池中执行（Windows 兼容）
            def run_vevo():
                return subprocess.run(
                    [str(self.vevo_python), script_path],
                    capture_output=True,
                    cwd=str(self.vevo_path),
                    timeout=300,  # 5分钟超时
                )
            
            result = await asyncio.get_event_loop().run_in_executor(None, run_vevo)
            
            stdout_str = result.stdout.decode('utf-8', errors='ignore')
            stderr_str = result.stderr.decode('utf-8', errors='ignore')
            
            print(f"[Vevo] returncode: {result.returncode}")
            print(f"[Vevo] stdout: {stdout_str[:1000]}")
            print(f"[Vevo] stderr: {stderr_str[:2000]}")
            
            if result.returncode == 0 and "SUCCESS" in stdout_str:
                return True
            else:
                self._last_error = f"returncode={result.returncode}, stderr={stderr_str[:200]}"
                return False
        except Exception as e:
            import traceback
            self._last_error = f"{type(e).__name__}: {e}"
            print(f"[Vevo] Exception type: {type(e).__name__}")
            print(f"[Vevo] Exception: {e}")
            traceback.print_exc()
            return False
        finally:
            try:
                os.unlink(script_path)
            except:
                pass
    
    async def batch_fix(
        self,
        audio_path: str,
        lrc_content: str,
        fix_tasks: List[FixTask],
        language: str = "zh",
        time_offset: float = 0.0,
        progress_cb: Optional[Callable[[float, str], None]] = None,
    ) -> FixResult:
        """
        批量修复歌词
        
        Args:
            audio_path: 音频文件路径
            lrc_content: LRC 歌词内容
            fix_tasks: 需要修复的任务列表
            language: 语言 (zh/en)
            progress_cb: 进度回调
        """
        if not fix_tasks:
            return FixResult(success=False, error="没有需要修复的歌词")
        
        # 解析歌词并应用时间偏移
        lyric_lines = parse_lrc(lrc_content)
        
        # 应用时间偏移
        if time_offset != 0:
            for line in lyric_lines:
                line.start_time = max(0, line.start_time + time_offset)
                line.end_time = max(0, line.end_time + time_offset)
        
        # 创建工作目录
        work_dir = tempfile.mkdtemp(prefix="lyric_fix_")
        segments_dir = Path(work_dir) / "segments"
        fixed_dir = Path(work_dir) / "fixed"
        segments_dir.mkdir()
        fixed_dir.mkdir()
        
        # 当前音频路径（逐步替换）
        current_audio = audio_path
        fixed_count = 0
        
        for idx, task in enumerate(fix_tasks):
            if progress_cb:
                progress_cb(
                    (idx + 1) / len(fix_tasks) * 0.9,
                    f"修复 {idx + 1}/{len(fix_tasks)}: {task.original_text[:15]}..."
                )
            
            line = lyric_lines[task.line_index]
            
            # 切分片段
            segment_path = str(segments_dir / f"seg_{task.line_index:04d}.wav")
            split_audio_segment(
                current_audio,
                line.start_time,
                line.end_time,
                segment_path,
            )
            
            # 调用 Vevo 修复
            fixed_path = str(fixed_dir / f"fixed_{task.line_index:04d}.wav")
            success = await self.fix_single_segment(
                audio_path=segment_path,
                original_text=task.original_text,
                target_text=task.target_text,
                output_path=fixed_path,
                language=language,
            )
            
            if success and Path(fixed_path).exists():
                # 替换原音频中的片段
                new_audio = str(Path(work_dir) / f"result_{idx:04d}.wav")
                replace_audio_segment(
                    current_audio,
                    fixed_path,
                    line.start_time,
                    line.end_time,
                    new_audio,
                )
                current_audio = new_audio
                fixed_count += 1
        
        if progress_cb:
            progress_cb(0.95, "保存结果...")
        
        # 保存最终结果
        audio_name = Path(audio_path).stem
        output_path = self.output_dir / f"{audio_name}_fixed.wav"
        
        # 复制最终结果
        final_audio = AudioSegment.from_file(current_audio)
        final_audio.export(str(output_path), format="wav")
        
        if progress_cb:
            progress_cb(1.0, "完成")
        
        return FixResult(
            success=True,
            output_path=str(output_path),
            fixed_count=fixed_count,
        )
    
    async def fix_single(
        self,
        audio_path: str,
        start_time: float,
        end_time: float,
        original_text: str,
        target_text: str,
        language: str = "zh",
        flow_matching_steps: int = 32,
        duration_ratio: float = 1.0,
        target_sample_rate: int = 24000,
        target_db: float = -25.0,
    ) -> dict:
        """
        单句修复
        
        Args:
            audio_path: 音频文件路径
            start_time: 开始时间（秒）
            end_time: 结束时间（秒）
            original_text: 原始文本
            target_text: 目标文本
            language: 语言
            flow_matching_steps: FM步数 (16-64)
            duration_ratio: 时长比例 (0.5-2.0)
            target_sample_rate: 输出采样率
            target_db: 目标响度 dB
        
        Returns:
            dict: {success, output_path, error}
        """
        import uuid
        
        # 创建临时目录
        work_dir = tempfile.mkdtemp(prefix="lyric_fix_single_")
        
        try:
            print(f"[fix_single] audio_path={audio_path}")
            print(f"[fix_single] start={start_time}, end={end_time}")
            print(f"[fix_single] original={original_text}, target={target_text}")
            
            # 切分片段
            segment_path = os.path.join(work_dir, "segment.wav")
            print(f"[fix_single] 切分片段到 {segment_path}")
            split_audio_segment(
                audio_path,
                start_time,
                end_time,
                segment_path,
            )
            print(f"[fix_single] 切分完成, 文件存在: {Path(segment_path).exists()}")
            
            # 调用 Vevo 修复
            fixed_path = os.path.join(work_dir, "fixed.wav")
            print(f"[fix_single] 调用 Vevo 修复... (steps={flow_matching_steps}, ratio={duration_ratio}, sr={target_sample_rate}, db={target_db})")
            success = await self.fix_single_segment(
                audio_path=segment_path,
                original_text=original_text,
                target_text=target_text,
                output_path=fixed_path,
                language=language,
                flow_matching_steps=flow_matching_steps,
                duration_ratio=duration_ratio,
                target_sample_rate=target_sample_rate,
                target_db=target_db,
            )
            print(f"[fix_single] Vevo 结果: success={success}, fixed exists={Path(fixed_path).exists()}")
            
            if success and Path(fixed_path).exists():
                # 复制到输出目录
                output_name = f"single_{uuid.uuid4().hex[:8]}.wav"
                final_path = self.output_dir / output_name
                
                audio = AudioSegment.from_file(fixed_path)
                audio.export(str(final_path), format="wav")
                
                return {
                    "success": True,
                    "output_path": str(final_path),
                }
            else:
                error_msg = getattr(self, '_last_error', 'Vevo 修复失败')
                return {
                    "success": False,
                    "error": error_msg,
                }
        except Exception as e:
            import traceback
            print(f"[fix_single] Exception: {e}")
            traceback.print_exc()
            return {
                "success": False,
                "error": str(e),
            }

    def list_outputs(self) -> List[dict]:
        """列出所有修复结果"""
        results = []
        for f in self.output_dir.glob("*_fixed.wav"):
            results.append({
                "name": f.stem,
                "path": str(f),
                "size": f.stat().st_size,
                "modified": f.stat().st_mtime,
            })
        return sorted(results, key=lambda x: x["modified"], reverse=True)
