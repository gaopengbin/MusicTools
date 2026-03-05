"""
音乐搜索与获取API路由
"""
import httpx
import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

from services.music_api import music_api, MusicSource, Track

try:
    from mutagen.id3 import ID3, TIT2, TPE1, TALB, APIC, USLT, ID3NoHeaderError
    MUTAGEN_AVAILABLE = True
except ImportError:
    MUTAGEN_AVAILABLE = False

router = APIRouter(prefix="/api/music", tags=["music"])


async def _embed_id3_tags(
    file_path: Path,
    name: str,
    artist: str,
    album: Optional[str],
    pic_id: Optional[str],
    lyric_id: Optional[str],
    source: str,
):
    """向 MP3 文件写入 ID3 标签（标题、艺术家、专辑、封面、歌词）"""
    if not MUTAGEN_AVAILABLE:
        return
    try:
        try:
            tags = ID3(str(file_path))
        except ID3NoHeaderError:
            tags = ID3()

        tags.add(TIT2(encoding=3, text=name))
        tags.add(TPE1(encoding=3, text=artist))
        if album:
            tags.add(TALB(encoding=3, text=album))

        # 封面
        if pic_id:
            try:
                music_source = MusicSource(source)
                pic_result = await music_api.get_pic(pic_id, music_source, size=500)
                pic_url = pic_result.get("url")
                if pic_url:
                    async with httpx.AsyncClient(timeout=15.0, verify=False) as client:
                        img_resp = await client.get(pic_url)
                        if img_resp.status_code == 200:
                            tags.add(APIC(
                                encoding=3,
                                mime="image/jpeg",
                                type=3,  # Cover (front)
                                desc="Cover",
                                data=img_resp.content,
                            ))
            except Exception:
                pass

        # 歌词
        if lyric_id:
            try:
                music_source = MusicSource(source)
                lyric_result = await music_api.get_lyric(lyric_id, music_source)
                lyric_text = lyric_result.get("lyric", "")
                if lyric_text:
                    tags.add(USLT(encoding=3, lang="chi", desc="", text=lyric_text))
            except Exception:
                pass

        tags.save(str(file_path), v2_version=3)
    except Exception:
        pass  # 元数据写入失败不影响主流程


# 确保下载目录存在
DOWNLOADS_DIR = Path("downloads")
DOWNLOADS_DIR.mkdir(exist_ok=True)


class TrackResponse(BaseModel):
    """曲目响应模型"""
    id: str
    name: str
    artist: str
    album: Optional[str] = None
    pic_id: Optional[str] = None
    lyric_id: Optional[str] = None
    url_id: Optional[str] = None
    source: Optional[str] = None


class SearchResponse(BaseModel):
    """搜索响应"""
    success: bool
    tracks: list[TrackResponse] = []
    error: Optional[str] = None


class UrlResponse(BaseModel):
    """URL响应"""
    success: bool
    url: Optional[str] = None
    error: Optional[str] = None


class LyricResponse(BaseModel):
    """歌词响应"""
    success: bool
    lyric: Optional[str] = None
    tlyric: Optional[str] = None  # 翻译歌词
    error: Optional[str] = None


@router.get("/sources")
async def get_sources():
    """获取支持的音乐源列表"""
    return {
        "sources": [
            {"id": s.value, "name": s.name} for s in MusicSource
        ]
    }


@router.get("/search", response_model=SearchResponse)
async def search_music(
    keyword: str = Query(..., description="搜索关键词"),
    source: str = Query("netease", description="音乐源"),
    count: int = Query(20, ge=1, le=100, description="每页数量"),
    page: int = Query(1, ge=1, description="页码")
):
    """搜索音乐"""
    try:
        music_source = MusicSource(source)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"不支持的音乐源: {source}")
    
    result = await music_api.search(
        keyword=keyword,
        source=music_source,
        count=count,
        page=page
    )
    
    if not result.success:
        raise HTTPException(status_code=500, detail=result.error)
    
    return SearchResponse(
        success=True,
        tracks=[TrackResponse(
            id=t.id,
            name=t.name,
            artist=t.artist,
            album=t.album,
            pic_id=t.pic_id,
            lyric_id=t.lyric_id,
            url_id=t.url_id,
            source=t.source
        ) for t in result.tracks]
    )


@router.get("/url", response_model=UrlResponse)
async def get_track_url(
    id: str = Query(..., description="曲目ID"),
    source: str = Query("netease", description="音乐源"),
    br: int = Query(320, description="码率 (128/192/320/740/999)")
):
    """获取音乐播放URL"""
    try:
        music_source = MusicSource(source)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"不支持的音乐源: {source}")
    
    result = await music_api.get_url(
        track_id=id,
        source=music_source,
        bitrate=br
    )
    
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error"))
    
    return UrlResponse(success=True, url=result.get("url"))


@router.get("/pic")
async def get_cover_pic(
    id: str = Query(..., description="图片ID"),
    source: str = Query("netease", description="音乐源"),
    size: int = Query(500, description="图片尺寸 (300/500)")
):
    """获取封面图片URL"""
    try:
        music_source = MusicSource(source)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"不支持的音乐源: {source}")
    
    result = await music_api.get_pic(
        pic_id=id,
        source=music_source,
        size=size
    )
    
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error"))
    
    return {"success": True, "url": result.get("url")}


@router.get("/lyric", response_model=LyricResponse)
async def get_lyric(
    id: str = Query(..., description="歌词ID"),
    source: str = Query("netease", description="音乐源")
):
    """获取歌词"""
    try:
        music_source = MusicSource(source)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"不支持的音乐源: {source}")
    
    result = await music_api.get_lyric(
        lyric_id=id,
        source=music_source
    )
    
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error"))
    
    return LyricResponse(
        success=True,
        lyric=result.get("lyric"),
        tlyric=result.get("tlyric")
    )


class DownloadRequest(BaseModel):
    """下载请求"""
    id: str
    source: str = "netease"
    name: str
    artist: str
    album: Optional[str] = None
    pic_id: Optional[str] = None
    lyric_id: Optional[str] = None
    br: int = 320


class DownloadResponse(BaseModel):
    """下载响应"""
    success: bool
    file_path: Optional[str] = None
    file_name: Optional[str] = None
    error: Optional[str] = None


@router.post("/download", response_model=DownloadResponse)
async def download_music(request: DownloadRequest):
    """下载音乐到服务器"""
    try:
        music_source = MusicSource(request.source)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"不支持的音乐源: {request.source}")
    
    # 获取音乐URL
    result = await music_api.get_url(
        track_id=request.id,
        source=music_source,
        bitrate=request.br
    )
    
    if not result.get("success") or not result.get("url"):
        raise HTTPException(status_code=500, detail=result.get("error") or "获取下载链接失败")
    
    url = result["url"]
    
    # 清理文件名
    safe_name = "".join(c for c in request.name if c.isalnum() or c in (' ', '-', '_', '一-龥')).strip()
    safe_artist = "".join(c for c in request.artist if c.isalnum() or c in (' ', '-', '_', '一-龥')).strip()
    
    if not safe_name:
        safe_name = "unknown"
    
    file_name = f"{safe_name} - {safe_artist}.mp3" if safe_artist else f"{safe_name}.mp3"
    file_path = DOWNLOADS_DIR / file_name
    
    # 如果文件已存在，添加随机后缀
    if file_path.exists():
        file_name = f"{safe_name} - {safe_artist}_{uuid.uuid4().hex[:6]}.mp3"
        file_path = DOWNLOADS_DIR / file_name
    
    # 下载文件
    try:
        async with httpx.AsyncClient(timeout=60.0, verify=False) as client:
            response = await client.get(url)
            response.raise_for_status()
            
            with open(file_path, "wb") as f:
                f.write(response.content)
        
        # 嵌入 ID3 元数据
        if MUTAGEN_AVAILABLE and file_path.suffix.lower() == '.mp3':
            await _embed_id3_tags(
                file_path=file_path,
                name=request.name,
                artist=request.artist,
                album=request.album,
                pic_id=request.pic_id,
                lyric_id=request.lyric_id,
                source=request.source,
            )
        
        return DownloadResponse(
            success=True,
            file_path=str(file_path),
            file_name=file_name
        )
    except Exception as e:
        return DownloadResponse(
            success=False,
            error=f"下载失败: {str(e)}"
        )
