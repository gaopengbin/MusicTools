<div align="center">

# 🎵 MusicTools

**一站式音乐搜索、下载、人声分离桌面工具**

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React_19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Tauri](https://img.shields.io/badge/Tauri_v2-FFC131?style=flat-square&logo=tauri&logoColor=black)](https://v2.tauri.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

🔍 多源音乐搜索 · ⬇️ 高品质下载 · 🎤 AI人声分离 · 📝 歌词嵌入 · 🎨 精美播放器

</div>

---

## ✨ 功能亮点

<table>
<tr>
<td width="50%">

### 🔍 多源音乐搜索
- 支持**网易云、QQ音乐、酷狗、酷我、咪咕**等多平台搜索
- 一键试听、下载，支持选择音质

</td>
<td width="50%">

### ⬇️ 音频下载
- 支持**1000+**网站的音频下载（YouTube、B站、SoundCloud 等）
- 自动嵌入 **ID3 标签**（封面、歌词、专辑、歌手）
- 可选同时下载 **LRC 歌词文件**

</td>
</tr>
<tr>
<td width="50%">

### 🎤 AI 人声分离
- 基于 **Meta Demucs** 深度学习模型
- 分离人声 / 伴奏 / 鼓 / 贝斯 / 吉他 / 钢琴
- 多模型可选，支持 GPU 加速

</td>
<td width="50%">

### 🎵 精美播放器
- 全局统一播放器，流畅切歌体验
- 实时歌词滚动显示
- 封面展示 + 丝滑动画过渡

</td>
</tr>
</table>

## 🛠️ 技术栈

| 层级 | 技术 |
|:---:|------|
| **前端** | Tauri v2 (Rust) · React 19 · TypeScript · Vite · TailwindCSS · Lucide Icons |
| **后端** | Python 3.10+ · FastAPI · yt-dlp · Demucs · Mutagen · FFmpeg |
| **AI 模型** | Meta Demucs (htdemucs / htdemucs_ft / htdemucs_6s) |

## 🚀 快速开始

### 前置要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| Python | 3.10+ | 后端运行环境 |
| Node.js | 18+ | 前端构建 |
| Rust | 1.77+ | Tauri 桌面框架 |
| FFmpeg | 最新 | 需添加到系统 PATH |

### 📦 安装

```bash
# 1. 克隆项目
git clone https://github.com/gaopengbin/MusicTools.git
cd MusicTools

# 2. 安装后端依赖
cd backend
pip install -r requirements.txt

# 3. 安装前端依赖
cd ../frontend
npm install
```

### ▶️ 运行

**方式一：一键启动（Windows）**

> 双击项目根目录下的 `start.bat`，自动启动后端 + Tauri 桌面应用。

**方式二：手动启动**

```bash
# 终端 1 - 启动后端 (端口 8000)
cd backend
python main.py

# 终端 2 - 启动 Tauri 桌面应用
cd frontend
npm run tauri:dev
```

**🏗️ 构建生产版本**

```bash
cd frontend
npm run tauri:build
```

## 📡 API 文档

启动后端后，访问 **http://localhost:8000/docs** 查看 Swagger 交互式文档。

<details>
<summary>📋 主要接口一览</summary>

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/download/` | 下载音频 |
| `POST` | `/api/download/info` | 获取媒体信息 |
| `GET` | `/api/download/list` | 获取下载列表 |
| `GET` | `/api/download/meta/{filename}` | 获取文件 ID3 元数据 |
| `GET` | `/api/download/lrc/{filename}` | 下载 LRC 歌词文件 |
| `POST` | `/api/music/search` | 多源音乐搜索 |
| `POST` | `/api/music/download` | 下载音乐（含元数据嵌入） |
| `POST` | `/api/separate/upload` | 上传并分离音频 |
| `POST` | `/api/separate/local` | 分离本地/已下载文件 |
| `GET` | `/api/separate/list` | 获取分离历史 |

</details>

## 📁 项目结构

```
MusicTools/
├── backend/                  # Python 后端
│   ├── main.py               # FastAPI 入口
│   ├── requirements.txt      # Python 依赖
│   ├── routers/
│   │   ├── download.py       # 下载 API（含元数据/LRC）
│   │   ├── music.py          # 音乐搜索 & 下载 API
│   │   └── separate.py       # 人声分离 API
│   └── services/
│       ├── downloader.py     # yt-dlp 封装
│       ├── music_api.py      # 多源音乐 API 客户端
│       └── separator.py      # Demucs 封装
├── frontend/                 # Tauri + React 前端
│   ├── src/
│   │   ├── api/index.ts      # API 调用层
│   │   ├── pages/            # 页面组件
│   │   │   ├── MusicPage     # 音乐搜索页
│   │   │   ├── DownloadsPage # 下载管理页
│   │   │   ├── SeparatePage  # 人声分离页
│   │   │   └── PlayerPage    # 全屏播放器
│   │   ├── App.tsx           # 主组件 & 全局播放器
│   │   └── index.css         # 全局样式 & 动画
│   └── src-tauri/            # Tauri / Rust 层
├── start.bat                 # Windows 一键启动脚本
└── README.md
```

## 🎛️ 分离模型对比

| 模型 | 音轨数 | 质量 | 速度 | 推荐场景 |
|------|:------:|:----:|:----:|----------|
| `htdemucs` | 4 (人声/伴奏/鼓/贝斯) | ⭐⭐⭐ | 🚀 快 | 日常使用，平衡之选 |
| `htdemucs_ft` | 4 | ⭐⭐⭐⭐ | 🐢 慢 4x | 追求最佳分离质量 |
| `htdemucs_6s` | 6 (+钢琴/吉他) | ⭐⭐⭐ | 🏃 中等 | 需要更多乐器音轨 |

## ⚠️ 注意事项

- 🕐 人声分离耗时较长，一首 4 分钟的歌约需 **1-3 分钟**（取决于 CPU/GPU 性能）
- 📥 首次运行 Demucs 会自动下载模型文件（约 **1GB**）
- ⚡ 强烈建议使用 **GPU 加速**（需安装 CUDA 版本的 PyTorch）

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 License

[MIT](LICENSE)

---

<div align="center">

**如果觉得有用，请给个 ⭐ Star 支持一下！**

*关键词：音乐下载器 · 人声分离 · 伴奏提取 · 歌词下载 · Demucs · Tauri · 桌面应用 · Music Downloader · Vocal Remover · Karaoke*

</div>
