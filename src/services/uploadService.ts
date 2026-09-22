import type { ApiResponse } from '@/types/domain';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';

export interface UploadedFile {
  filename: string;
  size: number;
  sizeFormatted: string;
  uploadedAt: string;
  storagePath: string;
  status: string;
  uploadTime?: string;
}

export interface UploadResponse {
  filename: string;
  size: number;
  sizeFormatted: string;
  uploadedAt: string;
  storagePath: string;
  files: UploadedFile[];
  status: string;
}

export function uploadFiles(
  files: File[],
  onProgress?: (progress: number) => void,
): Promise<ApiResponse<UploadResponse>> {
  return new Promise((resolve) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/upload`);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(100);
          resolve({
            success: true,
            data: json.data,
            timestamp: json.timestamp || new Date().toISOString(),
          });
          return;
        }

        resolve({
          success: false,
          error: json.error || `HTTP ${xhr.status}: ${xhr.statusText}`,
          timestamp: json.timestamp || new Date().toISOString(),
        });
      } catch {
        resolve({
          success: false,
          error: 'Invalid upload response',
          timestamp: new Date().toISOString(),
        });
      }
    };

    xhr.onerror = () => {
      resolve({
        success: false,
        error: 'Upload failed',
        timestamp: new Date().toISOString(),
      });
    };

    xhr.send(formData);
  });
}
