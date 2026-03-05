"""
GD Studio 音乐API服务
API文档: https://music-api.gdstudio.xyz/api.php
支持的音源: netease, tencent, tidal, spotify, ytmusic, qobuz, joox, deezer, migu, kugou, kuwo, ximalaya, apple
频率限制: 5分钟内不超过50次请求
"""
import httpx
from typing import Optional, Literal
from dataclasses import dataclass, field
from enum import Enum


class MusicSource(str, Enum):
    """支持的音乐源"""
    NETEASE = "netease"      # 网易云
    TENCENT = "tencent"      # QQ音乐
    TIDAL = "tidal"
    SPOTIFY = "spotify"
    YTMUSIC = "ytmusic"      # YouTube Music
    QOBUZ = "qobuz"
    JOOX = "joox"
    DEEZER = "deezer"
    MIGU = "migu"            # 咪咕
    KUGOU = "kugou"          # 酷狗
    KUWO = "kuwo"            # 酷我
    XIMALAYA = "ximalaya"    # 喜马拉雅
    APPLE = "apple"          # Apple Music


@dataclass
class Track:
    """音乐曲目"""
    id: str
    name: str
    artist: str
    album: Optional[str] = None
    pic_id: Optional[str] = None
    lyric_id: Optional[str] = None
    source: Optional[str] = None
    url_id: Optional[str] = None


@dataclass
class SearchResult:
    """搜索结果"""
    success: bool
    tracks: list[Track] = field(default_factory=list)
    error: Optional[str] = None


class MusicAPI:
    """GD Studio 音乐API客户端"""
    
    BASE_URL = "https://music-api.gdstudio.xyz/api.php"
    HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }
    
    def __init__(self, timeout: float = 30.0):
        self.timeout = timeout
    
    async def search(
        self,
        keyword: str,
        source: MusicSource = MusicSource.NETEASE,
        count: int = 20,
        page: int = 1
    ) -> SearchResult:
        """
        搜索音乐
        
        Args:
            keyword: 搜索关键词
            source: 音乐源
            count: 每页数量
            page: 页码
        """
        params = {
            "types": "search",
            "source": source.value,
            "name": keyword,
            "count": count,
            "pages": page
        }
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout, verify=False, headers=self.HEADERS) as client:
                response = await client.get(self.BASE_URL, params=params)
                response.raise_for_status()
                data = response.json()
                
                if isinstance(data, list):
                    tracks = []
                    for item in data:
                        track = Track(
                            id=str(item.get("id", "")),
                            name=item.get("name", ""),
                            artist=self._format_artist(item.get("artist", [])),
                            album=item.get("album", ""),
                            pic_id=str(item.get("pic_id", "")),
                            lyric_id=str(item.get("lyric_id", "")),
                            url_id=str(item.get("url_id", item.get("id", ""))),
                            source=source.value
                        )
                        tracks.append(track)
                    return SearchResult(success=True, tracks=tracks)
                else:
                    return SearchResult(success=False, error="Unexpected response format")
                    
        except Exception as e:
            return SearchResult(success=False, error=str(e))
    
    async def get_url(
        self,
        track_id: str,
        source: MusicSource = MusicSource.NETEASE,
        bitrate: Literal[128, 192, 320, 740, 999] = 320
    ) -> dict:
        """
        获取音乐播放/下载URL
        
        Args:
            track_id: 曲目ID
            source: 音乐源
            bitrate: 码率 (128/192/320/740/999)
        """
        params = {
            "types": "url",
            "source": source.value,
            "id": track_id,
            "br": bitrate
        }
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout, verify=False, headers=self.HEADERS) as client:
                response = await client.get(self.BASE_URL, params=params)
                response.raise_for_status()
                data = response.json()
                return {"success": True, "url": data.get("url", ""), "data": data}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def get_pic(
        self,
        pic_id: str,
        source: MusicSource = MusicSource.NETEASE,
        size: Literal[300, 500] = 500
    ) -> dict:
        """
        获取封面图片URL
        
        Args:
            pic_id: 图片ID
            source: 音乐源
            size: 图片尺寸 (300/500)
        """
        params = {
            "types": "pic",
            "source": source.value,
            "id": pic_id,
            "size": size
        }
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout, verify=False, headers=self.HEADERS) as client:
                response = await client.get(self.BASE_URL, params=params)
                response.raise_for_status()
                data = response.json()
                return {"success": True, "url": data.get("url", ""), "data": data}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def get_lyric(
        self,
        lyric_id: str,
        source: MusicSource = MusicSource.NETEASE
    ) -> dict:
        """
        获取歌词
        
        Args:
            lyric_id: 歌词ID
            source: 音乐源
        """
        params = {
            "types": "lyric",
            "source": source.value,
            "id": lyric_id
        }
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout, verify=False, headers=self.HEADERS) as client:
                response = await client.get(self.BASE_URL, params=params)
                response.raise_for_status()
                data = response.json()
                return {"success": True, "lyric": data.get("lyric", ""), "tlyric": data.get("tlyric", ""), "data": data}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def _format_artist(self, artist) -> str:
        """格式化艺术家信息"""
        if isinstance(artist, list):
            return " / ".join(artist)
        return str(artist) if artist else ""


# 全局实例
music_api = MusicAPI()
