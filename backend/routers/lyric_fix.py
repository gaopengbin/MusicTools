# -*- coding: utf-8 -*-
"""
歌词修复 API 路由
"""

import asyncio
import uuid
import time
import logging
from pathlib import Path
from typing import List, Optional, Literal

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel

from services.lyric_fixer import (
    LyricFixer,
    FixTask,
    parse_lrc,
    format_time,
)


router = APIRouter(prefix="/api/lyric-fix", tags=["lyric-fix"])
logger = logging.getLogger("musictools.lyric_fix")

# 全局修复器实例
fixer = LyricFixer()

# 任务管理
TASKS: dict[str, dict] = {}
TASKS_LOCK = asyncio.Lock()

# 上传目录
UPLOAD_DIR = Path("uploads/lyric_fix")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# 工程保存目录
PROJECT_DIR = Path("data/lyric_fix_projects")
PROJECT_DIR.mkdir(parents=True, exist_ok=True)


# ==================== 请求/响应模型 ====================

class LyricLineResponse(BaseModel):
    """歌词行响应"""
    index: int
    start_time: str
    end_time: str
    start_seconds: float
    end_seconds: float
    text: str


class ParseLrcResponse(BaseModel):
    """解析 LRC 响应"""
    success: bool
    lines: List[LyricLineResponse]
    total: int


class FixTaskRequest(BaseModel):
    """修复任务请求"""
    line_index: int
    original_text: str
    target_text: str


class SingleFixRequest(BaseModel):
    """单句修复请求"""
    audio_path: str
    start_time: float
    end_time: float
    original_text: str
    target_text: str
    language: Literal["zh", "en"] = "zh"
    flow_matching_steps: int = 32  # FM步数 16-64
    duration_ratio: float = 1.0    # 时长比例 0.5-2.0
    target_sample_rate: int = 24000
    target_db: float = -25.0


class RecognizeRequest(BaseModel):
    """语音识别请求"""
    audio_path: str
    start_time: float
    end_time: float
    language: Literal["zh", "en"] = "zh"


class BatchFixRequest(BaseModel):
    """批量修复请求"""
    audio_path: str
    lrc_content: str
    tasks: List[FixTaskRequest]
    language: Literal["zh", "en"] = "zh"
    time_offset: float = 0.0  # 时间偏移（秒）


class TaskStartResponse(BaseModel):
    """任务启动响应"""
    task_id: str


class TaskProgressResponse(BaseModel):
    """任务进度响应"""
    status: str  # queued, running, done, error
    progress: float
    message: Optional[str] = None
    error: Optional[str] = None
    output_path: Optional[str] = None
    fixed_count: Optional[int] = None


class LyricLineProject(BaseModel):
    """工程中的歌词行"""
    index: int
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    start_seconds: Optional[float] = None
    end_seconds: Optional[float] = None
    text: str = ""
    selected: bool = False
    editedText: Optional[str] = None
    fixedText: Optional[str] = None
    mergedWith: Optional[List[int]] = None
    isMergedChild: bool = False


class MarkerData(BaseModel):
    """分割标记"""
    id: str
    time: float


class SegmentData(BaseModel):
    """音频片段"""
    id: str
    start: float
    end: float
    originalText: Optional[str] = None
    targetText: Optional[str] = None
    fixedAudioUrl: Optional[str] = None
    isFixed: bool = False
    useFixed: bool = True


class ProjectData(BaseModel):
    """工程数据"""
    name: str
    audio_path: str = ""
    lrc_content: str = ""
    lyrics: List[LyricLineProject] = []
    language: Literal["zh", "en"] = "zh"
    time_offset: float = 0.0
    created_at: Optional[float] = None
    updated_at: Optional[float] = None
    # 音轨编辑器特有数据
    markers: List[MarkerData] = []
    segments: List[SegmentData] = []


# ==================== API 端点 ====================

@router.post("/parse-lrc", response_model=ParseLrcResponse)
async def parse_lrc_file(file: UploadFile = File(...)):
    """解析 LRC 歌词文件"""
    try:
        content = await file.read()
        lrc_content = content.decode("utf-8")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"读取文件失败: {e}")
    
    lines = parse_lrc(lrc_content)
    
    return ParseLrcResponse(
        success=True,
        lines=[
            LyricLineResponse(
                index=line.index,
                start_time=format_time(line.start_time),
                end_time=format_time(line.end_time),
                start_seconds=line.start_time,
                end_seconds=line.end_time,
                text=line.text,
            )
            for line in lines
        ],
        total=len(lines),
    )


@router.post("/parse-lrc-text", response_model=ParseLrcResponse)
async def parse_lrc_text(lrc_content: str = Form(...)):
    """解析 LRC 歌词文本"""
    lines = parse_lrc(lrc_content)
    
    return ParseLrcResponse(
        success=True,
        lines=[
            LyricLineResponse(
                index=line.index,
                start_time=format_time(line.start_time),
                end_time=format_time(line.end_time),
                start_seconds=line.start_time,
                end_seconds=line.end_time,
                text=line.text,
            )
            for line in lines
        ],
        total=len(lines),
    )


@router.post("/upload-audio")
async def upload_audio(file: UploadFile = File(...)):
    """上传音频文件"""
    # 保存文件
    file_ext = Path(file.filename).suffix
    file_name = f"{uuid.uuid4().hex[:8]}_{Path(file.filename).stem}{file_ext}"
    file_path = UPLOAD_DIR / file_name
    
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    return {
        "success": True,
        "path": str(file_path),
        "filename": file.filename,
    }


@router.post("/recognize")
async def recognize_audio(request: RecognizeRequest):
    """识别音频片段中的文字"""
    try:
        result = await fixer.recognize_audio(
            audio_path=request.audio_path,
            start_time=request.start_time,
            end_time=request.end_time,
            language=request.language,
        )
        return result
    except Exception as e:
        logger.exception("语音识别失败")
        return {"success": False, "error": str(e)}


@router.post("/fix-single")
async def fix_single_line(request: SingleFixRequest):
    """单句修复并返回结果"""
    try:
        result = await fixer.fix_single(
            audio_path=request.audio_path,
            start_time=request.start_time,
            end_time=request.end_time,
            original_text=request.original_text,
            target_text=request.target_text,
            language=request.language,
            flow_matching_steps=request.flow_matching_steps,
            duration_ratio=request.duration_ratio,
            target_sample_rate=request.target_sample_rate,
            target_db=request.target_db,
        )
        return result
    except Exception as e:
        logger.exception("单句修复失败")
        return {"success": False, "error": str(e)}


@router.post("/start", response_model=TaskStartResponse)
async def start_batch_fix(request: BatchFixRequest):
    """启动批量修复任务"""
    task_id = uuid.uuid4().hex[:16]
    
    # 获取事件循环
    main_loop = asyncio.get_running_loop()
    
    async with TASKS_LOCK:
        TASKS[task_id] = {
            "status": "queued",
            "progress": 0.0,
            "message": "等待处理...",
            "created_at": time.time(),
        }
    
    async def _run():
        try:
            def on_progress(pct: float, msg: str):
                asyncio.run_coroutine_threadsafe(
                    _update_progress(task_id, pct, msg),
                    main_loop
                )
            
            # 转换任务格式
            fix_tasks = [
                FixTask(
                    line_index=t.line_index,
                    original_text=t.original_text,
                    target_text=t.target_text,
                )
                for t in request.tasks
            ]
            
            result = await fixer.batch_fix(
                audio_path=request.audio_path,
                lrc_content=request.lrc_content,
                fix_tasks=fix_tasks,
                language=request.language,
                time_offset=request.time_offset,
                progress_cb=on_progress,
            )
            
            async with TASKS_LOCK:
                if result.success:
                    TASKS[task_id].update({
                        "status": "done",
                        "progress": 100.0,
                        "message": "修复完成",
                        "output_path": result.output_path,
                        "fixed_count": result.fixed_count,
                    })
                else:
                    TASKS[task_id].update({
                        "status": "error",
                        "error": result.error,
                    })
        
        except Exception as e:
            logger.exception("批量修复失败")
            async with TASKS_LOCK:
                TASKS[task_id].update({
                    "status": "error",
                    "error": str(e),
                })
    
    asyncio.create_task(_run())
    return TaskStartResponse(task_id=task_id)


async def _update_progress(task_id: str, pct: float, msg: str):
    """更新任务进度"""
    async with TASKS_LOCK:
        info = TASKS.get(task_id)
        if not info or info.get("status") in ("done", "error"):
            return
        info["progress"] = pct * 100
        info["message"] = msg
        if info.get("status") == "queued":
            info["status"] = "running"


@router.get("/progress/{task_id}", response_model=TaskProgressResponse)
async def get_task_progress(task_id: str):
    """获取任务进度"""
    async with TASKS_LOCK:
        info = TASKS.get(task_id)
        if not info:
            raise HTTPException(status_code=404, detail="任务不存在")
        
        return TaskProgressResponse(
            status=info.get("status", "unknown"),
            progress=info.get("progress", 0.0),
            message=info.get("message"),
            error=info.get("error"),
            output_path=info.get("output_path"),
            fixed_count=info.get("fixed_count"),
        )


@router.get("/list")
async def list_outputs():
    """获取所有修复结果"""
    return fixer.list_outputs()


@router.get("/file")
async def get_output_file(path: str):
    """获取修复后的文件"""
    file_path = Path(path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    
    # 安全检查
    try:
        file_path.resolve().relative_to(Path("outputs").resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="禁止访问")
    
    return FileResponse(
        path=str(file_path),
        filename=file_path.name,
        media_type="audio/wav",
    )


# ==================== 工程保存/加载 ====================

@router.post("/project/save")
async def save_project(project: ProjectData):
    """保存工程"""
    import json
    
    # 生成文件名
    safe_name = "".join(c for c in project.name if c.isalnum() or c in "_- ").strip()
    if not safe_name:
        safe_name = "untitled"
    
    project_file = PROJECT_DIR / f"{safe_name}.json"
    
    # 更新时间戳
    project_data = project.model_dump()
    project_data["updated_at"] = time.time()
    if not project_data.get("created_at"):
        project_data["created_at"] = time.time()
    
    with open(project_file, "w", encoding="utf-8") as f:
        json.dump(project_data, f, ensure_ascii=False, indent=2)
    
    return {
        "success": True,
        "path": str(project_file),
        "name": safe_name,
    }


@router.get("/project/list")
async def list_projects():
    """获取工程列表"""
    import json
    
    projects = []
    for f in PROJECT_DIR.glob("*.json"):
        try:
            with open(f, "r", encoding="utf-8") as fp:
                data = json.load(fp)
                projects.append({
                    "name": data.get("name", f.stem),
                    "path": str(f),
                    "created_at": data.get("created_at"),
                    "updated_at": data.get("updated_at"),
                    "audio_path": data.get("audio_path", ""),
                })
        except Exception:
            pass
    
    # 按更新时间排序
    projects.sort(key=lambda x: x.get("updated_at") or 0, reverse=True)
    return projects


@router.get("/project/load/{name}")
async def load_project(name: str):
    """加载工程"""
    import json
    
    project_file = PROJECT_DIR / f"{name}.json"
    if not project_file.exists():
        raise HTTPException(status_code=404, detail="工程不存在")
    
    with open(project_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    return data


@router.delete("/project/{name}")
async def delete_project(name: str):
    """删除工程"""
    project_file = PROJECT_DIR / f"{name}.json"
    if project_file.exists():
        project_file.unlink()
    return {"success": True}


# ==================== 音轨合并导出 ====================

class SegmentInfo(BaseModel):
    """片段信息"""
    start: float
    end: float
    fixed_audio_path: Optional[str] = None  # 修复后的音频路径，为空则使用原音频


class MergeSegmentsRequest(BaseModel):
    """合并片段请求"""
    audio_path: str  # 原音频路径
    segments: List[SegmentInfo]  # 片段列表
    output_name: Optional[str] = None  # 输出文件名


@router.post("/merge-segments")
async def merge_segments(request: MergeSegmentsRequest):
    """合并片段导出完整音频"""
    from pydub import AudioSegment
    import os
    
    try:
        # 加载原音频
        original_audio = AudioSegment.from_file(request.audio_path)
        
        # 按时间顺序排序片段
        sorted_segments = sorted(request.segments, key=lambda s: s.start)
        
        # 构建输出音频
        result = AudioSegment.empty()
        current_pos = 0  # 当前位置（毫秒）
        
        for seg in sorted_segments:
            start_ms = int(seg.start * 1000)
            end_ms = int(seg.end * 1000)
            
            # 添加片段前的空白（如果有）
            if start_ms > current_pos:
                # 使用原音频填充空白
                result += original_audio[current_pos:start_ms]
            
            # 添加片段
            if seg.fixed_audio_path and os.path.exists(seg.fixed_audio_path):
                # 使用修复后的音频
                fixed_audio = AudioSegment.from_file(seg.fixed_audio_path)
                result += fixed_audio
            else:
                # 使用原音频
                result += original_audio[start_ms:end_ms]
            
            current_pos = end_ms
        
        # 添加剩余部分
        if current_pos < len(original_audio):
            result += original_audio[current_pos:]
        
        # 保存输出
        output_name = request.output_name or Path(request.audio_path).stem
        output_path = fixer.output_dir / f"{output_name}_merged.wav"
        result.export(str(output_path), format="wav")
        
        return {
            "success": True,
            "output_path": str(output_path),
            "duration": len(result) / 1000,  # 秒
        }
    except Exception as e:
        logger.exception("合并片段失败")
        return {
            "success": False,
            "error": str(e),
        }
