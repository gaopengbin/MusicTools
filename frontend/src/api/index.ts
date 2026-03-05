import axios from 'axios';

// Detect if running inside Tauri (production build serves from https://tauri.localhost/)
// In Tauri, we need absolute URL to reach the Python backend.
// In Vite dev server, we use relative /api which gets proxied.
const isTauri = window.location.hostname === 'tauri.localhost' || '__TAURI_INTERNALS__' in window;
const BACKEND_URL = isTauri ? 'http://localhost:8000' : '';
const API_BASE = `${BACKEND_URL}/api`;

export { BACKEND_URL, API_BASE };

const api = axios.create({
  baseURL: API_BASE,
  timeout: 300000, // 5分钟超时，处理大文件
});

// 下载相关API
export const downloadApi = {
  // 获取媒体信息
  getInfo: (url: string) => 
    api.post<MediaInfo>('/download/info', null, { params: { url } }),
  
  // 下载音频
  download: (data: DownloadRequest) => 
    api.post<DownloadResponse>('/download/', data),
  
  // 获取下载列表
  list: () => 
    api.get<DownloadedFile[]>('/download/list'),
  
  // 获取文件下载URL
  getFileUrl: (filename: string) => 
    `${API_BASE}/download/file/${encodeURIComponent(filename)}`,
  
  // 删除文件
  delete: (filename: string) =>
    api.delete(`/download/file/${encodeURIComponent(filename)}`),

  // 读取 ID3 元数据（封面/歌词/标题等）
  getMeta: (filename: string) =>
    api.get<DownloadMeta>(`/download/meta/${encodeURIComponent(filename)}`),

  // 获取嵌入歌词的 LRC 文件下载 URL
  getLrcUrl: (filename: string) =>
    `${API_BASE}/download/lrc/${encodeURIComponent(filename)}`,
};

// 分离相关API
export const separateApi = {
  // 同步（原有）
  upload: (file: File, options: SeparateOptions) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', options.model);
    formData.append('mode', options.mode);
    formData.append('output_format', options.outputFormat);
    return api.post<SeparateResponse>('/separate/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  separateLocal: (data: SeparateLocalRequest) => api.post<SeparateResponse>('/separate/local', data),

  // 异步 + 进度
  uploadAsync: (file: File, options: SeparateOptions) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', options.model);
    formData.append('mode', options.mode);
    formData.append('output_format', options.outputFormat);
    return api.post<TaskStartResponse>('/separate/upload_async', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  localAsync: (data: SeparateLocalRequest) => api.post<TaskStartResponse>('/separate/local_async', data),
  progress: (taskId: string) => api.get<TaskProgress>('/separate/progress/' + taskId),
  result: (taskId: string) => api.get<SeparateResponse>('/separate/result/' + taskId),

  // 列表/模型
  list: () => api.get<SeparationResult[]>('/separate/list'),
  models: () => api.get<ModelInfo[]>('/separate/models'),

  // 下载
  getFileUrl: (path: string) => `${API_BASE}/separate/file?path=${encodeURIComponent(path)}`,
};

// 类型定义
export interface MediaInfo {
  title: string | null;
  duration: number | null;
  thumbnail: string | null;
  uploader: string | null;
}

export interface DownloadRequest {
  url: string;
  format: 'mp3' | 'wav' | 'flac' | 'm4a';
  quality: 'best' | 'medium';
}

export interface DownloadResponse {
  success: boolean;
  file_path: string | null;
  title: string | null;
  duration: number | null;
  thumbnail: string | null;
  error: string | null;
}

export interface DownloadedFile {
  name: string;
  path: string;
  size: number;
  modified: number;
}

export interface DownloadMeta {
  title: string | null;
  artist: string | null;
  album: string | null;
  cover_base64: string | null;
  cover_mime: string | null;
  lyrics: string | null;
}

export interface SeparateOptions {
  model: 'htdemucs' | 'htdemucs_ft' | 'htdemucs_6s';
  mode: 'vocals' | 'all';
  outputFormat: 'mp3' | 'wav' | 'flac';
}

export interface SeparateLocalRequest {
  file_path: string;
  model: string;
  mode: string;
  output_format: string;
}

export interface SeparateResponse {
  success: boolean;
  output_dir: string | null;
  stems: Record<string, string> | null;
  error: string | null;
  note?: string | null;
}

export interface TaskStartResponse { task_id: string }
export interface TaskProgress {
  status: 'queued' | 'running' | 'done' | 'error' | string;
  progress: number;
  note?: string | null;
  error?: string | null;
  output_dir?: string | null;
  stems?: Record<string, string> | null;
}

export interface SeparationResult {
  track: string;
  model: string;
  stems: { name: string; path: string; size: number }[];
  modified: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
}

// 音乐搜索API
export const musicApi = {
  // 获取音乐源列表
  getSources: () => api.get<{ sources: MusicSourceInfo[] }>('/music/sources'),
  
  // 搜索音乐
  search: (keyword: string, source: string = 'netease', count: number = 20, page: number = 1) =>
    api.get<MusicSearchResponse>('/music/search', { params: { keyword, source, count, page } }),
  
  // 获取播放URL
  getUrl: (id: string, source: string = 'netease', br: number = 320) =>
    api.get<MusicUrlResponse>('/music/url', { params: { id, source, br } }),
  
  // 获取封面
  getPic: (id: string, source: string = 'netease', size: number = 500) =>
    api.get<{ success: boolean; url: string }>('/music/pic', { params: { id, source, size } }),
  
  // 获取歌词
  getLyric: (id: string, source: string = 'netease') =>
    api.get<MusicLyricResponse>('/music/lyric', { params: { id, source } }),
  
  // 下载音乐到服务器
  download: (data: MusicDownloadRequest) =>
    api.post<MusicDownloadResponse>('/music/download', data),
};

export interface MusicSourceInfo {
  id: string;
  name: string;
}

export interface MusicTrack {
  id: string;
  name: string;
  artist: string;
  album: string | null;
  pic_id: string | null;
  lyric_id: string | null;
  url_id: string | null;
  source: string | null;
}

export interface MusicSearchResponse {
  success: boolean;
  tracks: MusicTrack[];
  error: string | null;
}

export interface MusicUrlResponse {
  success: boolean;
  url: string | null;
  error: string | null;
}

export interface MusicLyricResponse {
  success: boolean;
  lyric: string | null;
  tlyric: string | null;
  error: string | null;
}

export interface MusicDownloadRequest {
  id: string;
  source: string;
  name: string;
  artist: string;
  album?: string | null;
  pic_id?: string | null;
  lyric_id?: string | null;
  br?: number;
}

export interface MusicDownloadResponse {
  success: boolean;
  file_path: string | null;
  file_name: string | null;
  error: string | null;
}
