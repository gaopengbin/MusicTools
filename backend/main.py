"""
MusicTools - 音频处理工具后端服务
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from routers import download, separate, music, lyric_fix

# 创建应用
app = FastAPI(
    title="MusicTools API",
    description="音频下载与人声分离工具",
    version="1.0.0",
)

# CORS配置 - 允许前端访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173", "http://tauri.localhost", "https://tauri.localhost"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(download.router)
app.include_router(separate.router)
app.include_router(music.router)
app.include_router(lyric_fix.router)

# 确保必要目录存在
Path("downloads").mkdir(exist_ok=True)
Path("outputs").mkdir(exist_ok=True)
Path("outputs/lyric_fix").mkdir(parents=True, exist_ok=True)
Path("uploads").mkdir(exist_ok=True)
Path("uploads/lyric_fix").mkdir(parents=True, exist_ok=True)


@app.get("/")
async def root():
    """API根路径"""
    return {
        "name": "MusicTools API",
        "version": "1.0.0",
        "endpoints": {
            "download": "/api/download",
            "separate": "/api/separate",
            "music": "/api/music",
            "lyric_fix": "/api/lyric-fix",
        }
    }


@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
