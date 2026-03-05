"""
下载API路由
"""
import base64
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel, HttpUrl
from typing import Optional, Literal
from pathlib import Path

from services.downloader import AudioDownloader, DownloadResult

try:
    from mutagen.id3 import ID3, ID3NoHeaderError
    MUTAGEN_AVAILABLE = True
except ImportError:
    MUTAGEN_AVAILABLE = False

router = APIRouter(prefix="/api/download", tags=["download"])

# 全局下载器实例
downloader = AudioDownloader(output_dir="downloads")


class DownloadRequest(BaseModel):
    """下载请求"""
    url: str
    format: Literal["mp3", "wav", "flac", "m4a"] = "mp3"
    quality: Literal["best", "medium"] = "best"


class MediaInfoResponse(BaseModel):
    """媒体信息响应"""
    title: Optional[str]
    duration: Optional[int]
    thumbnail: Optional[str]
    uploader: Optional[str]


class DownloadResponse(BaseModel):
    """下载响应"""
    success: bool
    file_path: Optional[str] = None
    title: Optional[str] = None
    duration: Optional[int] = None
    thumbnail: Optional[str] = None
    error: Optional[str] = None


@router.post("/info", response_model=MediaInfoResponse)
async def get_media_info(url: str):
    """获取媒体信息（不下载）"""
    try:
        info = await downloader.get_info(url)
        return MediaInfoResponse(**info)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/", response_model=DownloadResponse)
async def download_audio(request: DownloadRequest):
    """下载音频"""
    result = await downloader.download(
        url=request.url,
        audio_format=request.format,
        quality=request.quality
    )
    
    if not result.success:
        raise HTTPException(status_code=400, detail=result.error)
    
    return DownloadResponse(
        success=result.success,
        file_path=result.file_path,
        title=result.title,
        duration=result.duration,
        thumbnail=result.thumbnail,
    )


@router.get("/list")
async def list_downloads():
    """获取已下载文件列表"""
    return downloader.list_downloads()


@router.get("/file/{filename}")
async def get_download_file(filename: str):
    """获取下载的文件"""
    file_path = Path("downloads") / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    
    return FileResponse(
        path=str(file_path),
        filename=filename,
        media_type="audio/mpeg"
    )


@router.delete("/file/{filename}")
async def delete_download_file(filename: str):
    """删除下载的文件"""
    file_path = Path("downloads") / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    
    try:
        file_path.unlink()
        return {"success": True, "message": "删除成功"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除失败: {str(e)}")


@router.get("/lrc/{filename}")
async def get_download_lrc(filename: str):
    """提取 MP3 内嵌歌词并以 .lrc 文件形式返回供下载"""
    file_path = Path("downloads") / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")

    if not MUTAGEN_AVAILABLE:
        raise HTTPException(status_code=503, detail="mutagen 未安装")

    lyrics = None
    title = None
    try:
        tags = ID3(str(file_path))
        for key in tags.keys():
            if key.startswith("USLT"):
                lyrics = str(tags[key])
                break
        if "TIT2" in tags:
            title = str(tags["TIT2"])
    except (ID3NoHeaderError, Exception):
        pass

    if not lyrics:
        raise HTTPException(status_code=404, detail="该文件没有嵌入歌词")

    from fastapi.responses import Response
    stem = title or file_path.stem
    safe_stem = "".join(c for c in stem if c.isalnum() or c in (' ', '-', '_', '·', '一-龥')).strip() or "lyrics"
    return Response(
        content=lyrics.encode("utf-8"),
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{safe_stem}.lrc"'},
    )


@router.get("/meta/{filename}")
async def get_download_meta(filename: str):
    """读取已下载 MP3 的 ID3 元数据（封面、歌词、标题、艺术家、专辑）"""
    file_path = Path("downloads") / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")

    result = {
        "title": None,
        "artist": None,
        "album": None,
        "cover_base64": None,
        "cover_mime": None,
        "lyrics": None,
    }

    if not MUTAGEN_AVAILABLE:
        return result

    try:
        tags = ID3(str(file_path))
    except ID3NoHeaderError:
        return result
    except Exception:
        return result

    # 标题/艺术家/专辑
    if "TIT2" in tags:
        result["title"] = str(tags["TIT2"])
    if "TPE1" in tags:
        result["artist"] = str(tags["TPE1"])
    if "TALB" in tags:
        result["album"] = str(tags["TALB"])

    # 封面图片 → base64 data URL
    for key in tags.keys():
        if key.startswith("APIC"):
            apic = tags[key]
            mime = apic.mime or "image/jpeg"
            result["cover_base64"] = f"data:{mime};base64,{base64.b64encode(apic.data).decode()}"
            result["cover_mime"] = mime
            break

    # 歌词
    for key in tags.keys():
        if key.startswith("USLT"):
            result["lyrics"] = str(tags[key])
            break

    return result
