"""
人声分离服务 - 基于Demucs实现音乐源分离
"""
import os
import sys
import asyncio
import subprocess
from pathlib import Path
from typing import Optional, Literal, Callable
from dataclasses import dataclass
from enum import Enum


class SeparationModel(str, Enum):
    """分离模型选择"""
    HTDEMUCS = "htdemucs"  # 默认模型，平衡速度和质量
    HTDEMUCS_FT = "htdemucs_ft"  # 精调版本，质量更好但更慢
    HTDEMUCS_6S = "htdemucs_6s"  # 6音轨版本，含钢琴和吉他


class SeparationMode(str, Enum):
    """分离模式"""
    VOCALS = "vocals"  # 仅分离人声和伴奏
    ALL = "all"  # 分离所有音轨 (vocals, drums, bass, other)


@dataclass
class SeparationResult:
    """分离结果"""
    success: bool
    output_dir: Optional[str] = None
    stems: Optional[dict[str, str]] = None  # {stem_name: file_path}
    error: Optional[str] = None
    note: Optional[str] = None


class AudioSeparator:
    """音频分离器"""
    
    def __init__(self, output_dir: str = "outputs"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
    
    async def separate(
        self,
        audio_path: str,
        model: SeparationModel = SeparationModel.HTDEMUCS,
        mode: SeparationMode = SeparationMode.VOCALS,
        output_format: str = "mp3",
        mp3_bitrate: int = 320,
        progress_cb: Optional[Callable[[float, str], None]] = None,
    ) -> SeparationResult:
        """
        分离音频
        
        Args:
            audio_path: 输入音频文件路径
            model: 使用的模型
            mode: 分离模式
            output_format: 输出格式 (wav, mp3, flac)
            mp3_bitrate: MP3比特率
        
        Returns:
            SeparationResult: 分离结果
        """
        audio_path = Path(audio_path)
        if not audio_path.exists():
            return SeparationResult(success=False, error=f"文件不存在: {audio_path}")
        
        # 构建demucs命令
        # 使用当前进程的解释器，确保在同一虚拟环境中
        python_exec = sys.executable or "python"
        base_cmd = [python_exec, "-m", "demucs", "-n", model.value, "-o", str(self.output_dir)]
        cmd = list(base_cmd)
        
        # 仅分离人声模式
        if mode == SeparationMode.VOCALS:
            cmd.extend(["--two-stems", "vocals"])
        
        # 输出格式
        if output_format == "mp3":
            # 使用 --mp3-preset fast 加快编码速度
            cmd.extend(["--mp3", "--mp3-bitrate", str(mp3_bitrate), "--mp3-preset", "2"])
        elif output_format == "flac":
            cmd.append("--flac")
        
        # 添加输入文件
        cmd.append(str(audio_path))

        # 构建环境：添加 ffmpeg-shared DLL 路径
        env = os.environ.copy()
        # Windows 上通过 scoop 安装的 ffmpeg-shared DLL 路径
        ffmpeg_shared_bin = Path.home() / "scoop" / "apps" / "ffmpeg-shared" / "current" / "bin"
        if ffmpeg_shared_bin.exists():
            env["PATH"] = str(ffmpeg_shared_bin) + os.pathsep + env.get("PATH", "")
        
        try:
            # 优先使用异步子进程；在某些Windows环境下会抛出NotImplementedError，转用线程+subprocess.run
            try:
                process = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    env=env,
                )
                # 读取stderr实时解析进度
                async def _read_stream(stream):
                    agg = bytearray()
                    while True:
                        chunk = await stream.read(1024)
                        if not chunk:
                            break
                        agg.extend(chunk)
                        if progress_cb:
                            try:
                                text = chunk.decode(errors="ignore")
                                # 匹配形如 " 35%|" 的进度
                                import re
                                for m in re.finditer(r"(\d{1,3})%\|", text):
                                    pct = max(0, min(100, int(m.group(1))))
                                    progress_cb(float(pct), "running")
                            except Exception:
                                pass
                    return bytes(agg)
                stderr_task = asyncio.create_task(_read_stream(process.stderr))
                stdout_task = asyncio.create_task(_read_stream(process.stdout))
                await process.wait()
                stderr = await stderr_task
                stdout = await stdout_task
                returncode = process.returncode
            except NotImplementedError:
                def _run():
                    # 流式读取stderr，解析进度
                    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, universal_newlines=True, bufsize=1, env=env)
                    out_buf = []
                    err_buf = []
                    try:
                        for line in proc.stderr:
                            err_buf.append(line)
                            if progress_cb:
                                import re
                                for m in re.finditer(r"(\d{1,3})%\|", line):
                                    pct = max(0, min(100, int(m.group(1))))
                                    progress_cb(float(pct), "running")
                        o, _ = proc.communicate()
                        if o:
                            out_buf.append(o)
                    finally:
                        rc = proc.wait()
                    return rc, ''.join('' if x is None else x for x in out_buf).encode(), ''.join(err_buf).encode()
                returncode, stdout, stderr = await asyncio.to_thread(_run)
            
            if returncode != 0:
                err_out = (stderr or b"").decode(errors="ignore")
                out = (stdout or b"").decode(errors="ignore")
                error_msg = err_out.strip() or out.strip() or "Demucs 执行失败，未返回错误信息"
                error_msg += f"\n命令: {' '.join(cmd)}\n返回码: {returncode}"
                # 常见错误提示增强
                lower = error_msg.lower()
                if "no module named demucs" in lower:
                    error_msg += "\n提示: 运行环境未找到demucs，请确认服务使用的虚拟环境中已安装。"
                if "ffmpeg" in lower:
                    error_msg += "\n提示: 需要安装并配置FFmpeg到PATH。"
                # 自动回退到 WAV（torchcodec/ffmpeg 引起的 MP3 保存失败）
                if output_format == "mp3" and ("torchcodec" in lower or "could not load libtorchcodec" in lower or "ffmpeg" in lower):
                    # 构造 WAV 命令重试
                    cmd_wav = list(base_cmd)
                    if mode == SeparationMode.VOCALS:
                        cmd_wav.extend(["--two-stems", "vocals"])
                    cmd_wav.append(str(audio_path))
                    # 执行回退（强制禁用 torchcodec）
                    env_wav = os.environ.copy()
                    env_wav["TORCHAUDIO_USE_TORCHCODEC"] = "0"
                    try:
                        p2 = await asyncio.create_subprocess_exec(*cmd_wav, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, env=env_wav)
                        stdout2, stderr2 = await p2.communicate()
                        rc2 = p2.returncode
                    except NotImplementedError:
                        def _run2():
                            c = subprocess.run(cmd_wav, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=False, env=env_wav)
                            return c.returncode, c.stdout, c.stderr
                        rc2, stdout2, stderr2 = await asyncio.to_thread(_run2)
                    if rc2 == 0:
                        output_subdir = self.output_dir / model.value / audio_path.stem
                        stems = {}
                        if output_subdir.exists():
                            for stem_file in output_subdir.iterdir():
                                if stem_file.suffix == ".wav":
                                    stems[stem_file.stem] = str(stem_file)
                        if stems:
                            return SeparationResult(success=True, output_dir=str(output_subdir), stems=stems, note="MP3保存失败，已自动回退为WAV。请安装FFmpeg full-shared并重试MP3。")
                    # 回退仍失败，返回合并错误
                    e2 = (stderr2 or b"").decode(errors="ignore")
                    return SeparationResult(success=False, error=error_msg + "\n回退WAV也失败: " + e2)
                return SeparationResult(success=False, error=error_msg)
            
            # 获取输出文件
            output_subdir = self.output_dir / model.value / audio_path.stem
            stems = {}
            
            if output_subdir.exists():
                ext = output_format if output_format != "wav" else "wav"
                for stem_file in output_subdir.iterdir():
                    if stem_file.suffix == f".{ext}":
                        stem_name = stem_file.stem
                        stems[stem_name] = str(stem_file)
            
            if not output_subdir.exists() or not stems:
                # 正常返回码但未找到文件，给出提示
                return SeparationResult(
                    success=False,
                    error=(
                        "分离执行完成但未找到输出文件。\n"
                        f"期望目录: {output_subdir}\n"
                        f"命令: {' '.join(cmd)}\n"
                    )
                )
            if progress_cb:
                progress_cb(100.0, "done")
            return SeparationResult(
                success=True,
                output_dir=str(output_subdir),
                stems=stems,
            )
            
        except FileNotFoundError:
            return SeparationResult(
                success=False,
                error="Demucs未安装或不在PATH中，请先运行: pip install demucs"
            )
        except Exception as e:
            # 某些异常无message，仍给出命令行信息
            emsg = str(e) or f"未知异常: {e.__class__.__name__}\n命令: {' '.join(cmd)}"
            return SeparationResult(success=False, error=emsg)
    
    def list_outputs(self) -> list[dict]:
        """列出所有分离结果"""
        results = []
        
        for model_dir in self.output_dir.iterdir():
            if model_dir.is_dir():
                for track_dir in model_dir.iterdir():
                    if track_dir.is_dir():
                        stems = []
                        for f in track_dir.iterdir():
                            if f.is_file() and f.suffix in ['.mp3', '.wav', '.flac']:
                                stems.append({
                                    'name': f.stem,
                                    'path': str(f),
                                    'size': f.stat().st_size,
                                })
                        
                        if stems:
                            results.append({
                                'track': track_dir.name,
                                'model': model_dir.name,
                                'stems': stems,
                                'modified': track_dir.stat().st_mtime,
                            })
        
        return sorted(results, key=lambda x: x['modified'], reverse=True)
