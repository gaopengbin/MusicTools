"""
人声分离API路由
"""
import logging
import asyncio
import logging
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, Literal
from pathlib import Path
import shutil
import uuid
import time

from services.separator import AudioSeparator, SeparationModel, SeparationMode

router = APIRouter(prefix="/api/separate", tags=["separate"])
logger = logging.getLogger("musictools.separate")

# 全局分离器实例
separator = AudioSeparator(output_dir="outputs")

# 简单任务管理（内存）
TASKS: dict[str, dict] = {}
TASKS_LOCK = asyncio.Lock()

# 上传文件临时目录
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


def sanitize_filename(filename: str) -> str:
    """清理文件名，移除不安全字符"""
    import re
    # 移除路径分隔符和其他不安全字符
    name = re.sub(r'[<>:"/\\|?*]', '_', filename)
    # 移除首尾空格和点
    name = name.strip(' .')
    return name or 'untitled'


def get_unique_path(base_path: Path) -> Path:
    """获取唯一路径，如果已存在则添加数字后缀"""
    if not base_path.exists():
        return base_path
    stem = base_path.stem
    suffix = base_path.suffix
    parent = base_path.parent
    counter = 1
    while True:
        new_path = parent / f"{stem}_{counter}{suffix}"
        if not new_path.exists():
            return new_path
        counter += 1


class SeparateRequest(BaseModel):
    """分离请求（使用已有文件）"""
    file_path: str
    model: Literal["htdemucs", "htdemucs_ft", "htdemucs_6s"] = "htdemucs"
    mode: Literal["vocals", "all"] = "vocals"
    output_format: Literal["mp3", "wav", "flac"] = "mp3"


class SeparateResponse(BaseModel):
    """分离响应"""
    success: bool
    output_dir: Optional[str] = None
    stems: Optional[dict] = None
    error: Optional[str] = None
    note: Optional[str] = None

class TaskStartResponse(BaseModel):
    task_id: str

class TaskProgressResponse(BaseModel):
    status: str
    progress: float
    note: Optional[str] = None
    error: Optional[str] = None
    output_dir: Optional[str] = None
    stems: Optional[dict] = None


@router.post("/upload")
async def upload_and_separate(
    file: UploadFile = File(...),
    model: str = Form(default="htdemucs"),
    mode: str = Form(default="vocals"),
    output_format: str = Form(default="mp3"),
):
    """上传文件并分离"""
    # 保存上传的文件，使用原始文件名
    original_name = sanitize_filename(Path(file.filename).stem)
    file_ext = Path(file.filename).suffix
    upload_path = get_unique_path(UPLOAD_DIR / f"{original_name}{file_ext}")
    
    try:
        with open(upload_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        logger.exception("上传保存失败")
        raise HTTPException(status_code=500, detail=f"文件上传失败: {str(e)}")
    finally:
        try:
            file.file.close()
        except Exception:
            pass
    
    # 执行分离
    try:
        result = await separator.separate(
            audio_path=str(upload_path),
            model=SeparationModel(model),
            mode=SeparationMode(mode),
            output_format=output_format,
        )
    except ValueError as e:
        # Enum 转换失败等
        logger.exception("参数错误")
        raise HTTPException(status_code=400, detail=f"参数错误: {e}")
    
    if not result.success:
        logger.error("分离失败: %s", result.error)
        raise HTTPException(status_code=400, detail=result.error or "分离失败，未返回错误信息")
    
    return SeparateResponse(
        success=result.success,
        output_dir=result.output_dir,
        stems=result.stems,
        note=result.note,
    )


@router.post("/local", response_model=SeparateResponse)
async def separate_local_file(request: SeparateRequest):
    """分离本地已有文件（如已下载的文件）"""
    result = await separator.separate(
        audio_path=request.file_path,
        model=SeparationModel(request.model),
        mode=SeparationMode(request.mode),
        output_format=request.output_format,
    )
    
    if not result.success:
        raise HTTPException(status_code=400, detail=result.error)
    
    return SeparateResponse(
        success=result.success,
        output_dir=result.output_dir,
        stems=result.stems,
        note=result.note,
    )


@router.get("/list")
async def list_outputs():
    """获取所有分离结果"""
    return separator.list_outputs()


@router.get("/file")
async def get_output_file(path: str):
    """获取分离后的文件"""
    file_path = Path(path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    
    # 安全检查：确保路径在outputs目录下
    try:
        file_path.resolve().relative_to(Path("outputs").resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="禁止访问")
    
    return FileResponse(
        path=str(file_path),
        filename=file_path.name,
        media_type="audio/mpeg"
    )


@router.post("/upload_async", response_model=TaskStartResponse)
async def upload_and_separate_async(
    file: UploadFile = File(...),
    model: str = Form(default="htdemucs"),
    mode: str = Form(default="vocals"),
    output_format: str = Form(default="mp3"),
):
    # 使用原始文件名
    original_name = sanitize_filename(Path(file.filename).stem)
    file_ext = Path(file.filename).suffix
    upload_path = get_unique_path(UPLOAD_DIR / f"{original_name}{file_ext}")
    try:
        with open(upload_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    finally:
        try:
            file.file.close()
        except Exception:
            pass
    task_id = str(uuid.uuid4()).replace('-', '')[:16]
    # 获取当前运行的事件循环，用于线程安全回调
    main_loop = asyncio.get_running_loop()
    async with TASKS_LOCK:
        TASKS[task_id] = {"status": "queued", "progress": 0.0, "created_at": time.time()}
    async def _run():
        try:
            def on_prog(pct: float, _):
                try:
                    # 使用 run_coroutine_threadsafe 保证线程安全
                    asyncio.run_coroutine_threadsafe(_update_progress(task_id, pct), main_loop)
                except Exception:
                    pass
            res = await separator.separate(
                audio_path=str(upload_path),
                model=SeparationModel(model),
                mode=SeparationMode(mode),
                output_format=output_format,
                progress_cb=on_prog,
            )
            async with TASKS_LOCK:
                TASKS[task_id].update({
                    "status": "done" if res.success else "error",
                    "progress": 100.0 if res.success else TASKS[task_id].get("progress", 0.0),
                    "output_dir": res.output_dir,
                    "stems": res.stems,
                    "error": res.error,
                    "note": res.note,
                })
        except Exception as e:
            async with TASKS_LOCK:
                TASKS[task_id].update({"status": "error", "error": str(e)})
    asyncio.create_task(_run())
    return TaskStartResponse(task_id=task_id)

async def _update_progress(task_id: str, pct: float):
    async with TASKS_LOCK:
        info = TASKS.get(task_id)
        if not info:
            return
        # 不要覆盖已完成/错误状态，避免 100% 后仍显示 running
        if info.get("status") in ("done", "error"):
            return
        info["progress"] = float(pct)
        if info.get("status") == "queued":
            info["status"] = "running"
        info["updated_at"] = time.time()

@router.post("/local_async", response_model=TaskStartResponse)
async def separate_local_file_async(request: SeparateRequest):
    task_id = str(uuid.uuid4()).replace('-', '')[:16]
    # 获取当前运行的事件循环，用于线程安全回调
    main_loop = asyncio.get_running_loop()
    async with TASKS_LOCK:
        TASKS[task_id] = {"status": "queued", "progress": 0.0, "created_at": time.time()}
    async def _run():
        try:
            def on_prog(pct: float, _):
                try:
                    # 使用 run_coroutine_threadsafe 保证线程安全
                    asyncio.run_coroutine_threadsafe(_update_progress(task_id, pct), main_loop)
                except Exception:
                    pass
            res = await separator.separate(
                audio_path=request.file_path,
                model=SeparationModel(request.model),
                mode=SeparationMode(request.mode),
                output_format=request.output_format,
                progress_cb=on_prog,
            )
            async with TASKS_LOCK:
                TASKS[task_id].update({
                    "status": "done" if res.success else "error",
                    "progress": 100.0 if res.success else TASKS[task_id].get("progress", 0.0),
                    "output_dir": res.output_dir,
                    "stems": res.stems,
                    "error": res.error,
                    "note": res.note,
                })
        except Exception as e:
            async with TASKS_LOCK:
                TASKS[task_id].update({"status": "error", "error": str(e)})
    asyncio.create_task(_run())
    return TaskStartResponse(task_id=task_id)

@router.get("/progress/{task_id}", response_model=TaskProgressResponse)
async def get_task_progress(task_id: str):
    async with TASKS_LOCK:
        info = TASKS.get(task_id)
        if not info:
            raise HTTPException(status_code=404, detail="任务不存在")
        return TaskProgressResponse(
            status=info.get("status", "unknown"),
            progress=float(info.get("progress", 0.0)),
            note=info.get("note"),
            error=info.get("error"),
            output_dir=info.get("output_dir"),
            stems=info.get("stems"),
        )

@router.get("/result/{task_id}", response_model=SeparateResponse)
async def get_task_result(task_id: str):
    async with TASKS_LOCK:
        info = TASKS.get(task_id)
        if not info:
            raise HTTPException(status_code=404, detail="任务不存在")
        if info.get("status") != "done":
            raise HTTPException(status_code=202, detail="任务未完成")
        return SeparateResponse(
            success=True,
            output_dir=info.get("output_dir"),
            stems=info.get("stems"),
            error=None,
            note=info.get("note"),
        )

@router.get("/models")
async def list_models():
    """获取可用的分离模型"""
    return [
        {
            "id": "htdemucs",
            "name": "HTDemucs",
            "description": "默认模型，平衡速度和质量",
        },
        {
            "id": "htdemucs_ft",
            "name": "HTDemucs Fine-tuned",
            "description": "精调版本，质量更好但速度慢4倍",
        },
        {
            "id": "htdemucs_6s",
            "name": "HTDemucs 6-stems",
            "description": "6音轨版本，额外分离钢琴和吉他",
        },
    ]
