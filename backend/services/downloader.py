"""
音频下载服务 - 基于yt-dlp实现多平台音频下载
"""
import os
import asyncio
from pathlib import Path
from typing import Optional
from dataclasses import dataclass
import yt_dlp


@dataclass
class DownloadResult:
    """下载结果"""
    success: bool
    file_path: Optional[str] = None
    title: Optional[str] = None
    duration: Optional[int] = None
    thumbnail: Optional[str] = None
    error: Optional[str] = None


class AudioDownloader:
    """音频下载器"""
    
    def __init__(self, output_dir: str = "downloads"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
    
    def _get_ydl_opts(self, audio_format: str = "mp3", quality: str = "best") -> dict:
        """获取yt-dlp配置选项"""
        return {
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': audio_format,
                'preferredquality': '320' if quality == 'best' else '192',
            }],
            'outtmpl': str(self.output_dir / '%(title)s.%(ext)s'),
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
            'writethumbnail': True,
            'embedthumbnail': False,
        }
    
    async def get_info(self, url: str) -> dict:
        """获取媒体信息（不下载）"""
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
        }
        
        def _extract():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                return ydl.extract_info(url, download=False)
        
        loop = asyncio.get_event_loop()
        info = await loop.run_in_executor(None, _extract)
        
        return {
            'title': info.get('title'),
            'duration': info.get('duration'),
            'thumbnail': info.get('thumbnail'),
            'uploader': info.get('uploader'),
            'webpage_url': info.get('webpage_url'),
        }
    
    async def download(
        self,
        url: str,
        audio_format: str = "mp3",
        quality: str = "best"
    ) -> DownloadResult:
        """
        下载音频
        
        Args:
            url: 媒体URL
            audio_format: 输出格式 (mp3, wav, flac, m4a)
            quality: 音质 (best, medium)
        
        Returns:
            DownloadResult: 下载结果
        """
        ydl_opts = self._get_ydl_opts(audio_format, quality)
        
        def _download():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                return info
        
        try:
            loop = asyncio.get_event_loop()
            info = await loop.run_in_executor(None, _download)
            
            # 获取下载后的文件路径
            title = info.get('title', 'unknown')
            # 清理文件名中的非法字符
            safe_title = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_')).strip()
            file_path = self.output_dir / f"{safe_title}.{audio_format}"
            
            # 尝试找到实际文件
            actual_file = None
            for f in self.output_dir.iterdir():
                if f.suffix == f".{audio_format}" and f.stem.startswith(safe_title[:20]):
                    actual_file = f
                    break
            
            if not actual_file:
                # 使用yt-dlp的prepare_filename
                actual_file = file_path
            
            return DownloadResult(
                success=True,
                file_path=str(actual_file),
                title=title,
                duration=info.get('duration'),
                thumbnail=info.get('thumbnail'),
            )
            
        except Exception as e:
            return DownloadResult(
                success=False,
                error=str(e)
            )
    
    def list_downloads(self) -> list[dict]:
        """列出所有已下载的文件"""
        files = []
        for f in self.output_dir.iterdir():
            if f.is_file() and f.suffix in ['.mp3', '.wav', '.flac', '.m4a']:
                files.append({
                    'name': f.name,
                    'path': str(f),
                    'size': f.stat().st_size,
                    'modified': f.stat().st_mtime,
                })
        return sorted(files, key=lambda x: x['modified'], reverse=True)
