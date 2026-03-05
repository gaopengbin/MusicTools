# MusicTools

音频下载与人声分离桌面工具，基于Tauri构建，支持多平台音频爬取和AI驱动的人声分离。

## 功能特性

- **音频下载**: 支持1000+网站的音频下载（YouTube、B站、SoundCloud、网易云等）
- **人声分离**: 基于Demucs深度学习模型，分离人声/伴奏/鼓/贝斯等
- **多格式支持**: MP3、WAV、FLAC、M4A等格式输出
- **桌面应用**: Tauri v2 + React + TailwindCSS构建的原生桌面应用

## 技术栈

**后端:**
- Python 3.10+
- FastAPI
- yt-dlp（音频下载）
- Demucs（人声分离）
- FFmpeg

**前端 (Tauri桌面应用):**
- Tauri v2 (Rust)
- React 19 + TypeScript
- Vite
- TailwindCSS
- Lucide Icons

## 快速开始

### 前置要求

- Python 3.10+
- Node.js 18+
- Rust (rustc 1.77+)
- FFmpeg（需添加到系统PATH）

### 安装步骤

1. **克隆项目**

```bash
git clone <repo-url>
cd MusicTools
```

2. **安装后端依赖**

```bash
cd backend
pip install -r requirements.txt
```

3. **安装前端依赖**

```bash
cd frontend
npm install
```

### 运行项目

**方式一：一键启动（Windows）**

双击 `start.bat` 即可自动启动后端和Tauri桌面应用。

**方式二：手动启动**

1. **启动后端服务** (端口8000)

```bash
cd backend
python main.py
```

2. **启动Tauri桌面应用**

```bash
cd frontend
npm run tauri:dev
```

**构建生产版本**

```bash
cd frontend
npm run tauri:build
```

## API文档

启动后端后，访问 http://localhost:8000/docs 查看Swagger API文档。

### 主要接口

- `POST /api/download/` - 下载音频
- `POST /api/download/info` - 获取媒体信息
- `GET /api/download/list` - 获取下载列表
- `POST /api/separate/upload` - 上传并分离音频
- `POST /api/separate/local` - 分离本地文件
- `GET /api/separate/list` - 获取分离结果

## 项目结构

```
MusicTools/
├── backend/
│   ├── main.py            # FastAPI入口
│   ├── requirements.txt
│   ├── routers/
│   │   ├── download.py    # 下载API
│   │   └── separate.py    # 分离API
│   ├── services/
│   │   ├── downloader.py  # yt-dlp封装
│   │   └── separator.py   # Demucs封装
│   ├── downloads/         # 下载文件
│   ├── uploads/           # 上传临时文件
│   └── outputs/           # 分离结果
├── frontend/
│   ├── src/
│   │   ├── api/           # API调用
│   │   ├── pages/         # 页面组件
│   │   └── App.tsx        # 主组件
│   ├── src-tauri/
│   │   ├── src/           # Rust源码
│   │   ├── Cargo.toml     # Rust依赖
│   │   └── tauri.conf.json # Tauri配置
│   └── ...
└── README.md
```

## 分离模型说明

| 模型 | 说明 | 速度 |
|------|------|------|
| htdemucs | 默认模型，平衡速度和质量 | 快 |
| htdemucs_ft | 精调版本，质量更好 | 慢4倍 |
| htdemucs_6s | 6音轨版本，含钢琴和吉他 | 中等 |

## 注意事项

- 人声分离处理时间较长，一首4分钟的歌曲大约需要1-3分钟（取决于CPU/GPU性能）
- 首次运行Demucs会自动下载模型文件（约1GB）
- 建议使用GPU加速（需安装CUDA版本的PyTorch）

## License

MIT
