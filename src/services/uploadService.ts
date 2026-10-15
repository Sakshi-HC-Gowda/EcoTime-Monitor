import type { ApiResponse } from '@/types/domain';
import { apiClient } from '@/services/apiClient';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';

export type UploadStatus = 'pending' | 'scheduled' | 'running' | 'completed' | 'failed';

export interface UploadRegistration {
  id: string;
  activityId: string;
  filename: string;
  size: number;
  contentType: string;
  status: UploadStatus;
  scheduledStartTime: string | null;
  recommendationReason: string | null;
  windowId: string | null;
  uploadedAt: string | null;
  createdAt: string;
  updatedAt: string;
  error: string | null;
  downloadUrl: string | null;
}

export interface UploadScheduleResponse {
  upload: UploadRegistration;
  recommendation: {
    activityId: string;
    recommendation: string;
    reason: string;
    status: 'scheduled' | 'not_scheduled';
    windowId: string | null;
    startTime: string | null;
  };
}

export function registerUpload(
  activityId: string,
  file: File,
  onProgress?: (progress: number) => void,
  idempotencyKey?: string,
): Promise<ApiResponse<UploadRegistration>> {
  return new Promise((resolve) => {
    const formData = new FormData();
    formData.append('activityId', activityId);
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/upload`);
    const token = typeof window === 'undefined'
      ? null
      : window.localStorage.getItem('ecotime_token');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    if (idempotencyKey) xhr.setRequestHeader('Idempotency-Key', idempotencyKey);

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
            data: json.data as UploadRegistration,
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

    const fail = (message: string) => {
      resolve({
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
      });
    };

    xhr.onerror = () => fail('Upload network request failed');
    xhr.onabort = () => fail('Upload request was cancelled');
    xhr.ontimeout = () => fail('Upload request timed out');
    xhr.send(formData);
  });
}

export const uploadService = {
  getActivityUploads(activityId: string): Promise<ApiResponse<UploadRegistration[]>> {
    return apiClient.request(`/activities/${encodeURIComponent(activityId)}/uploads`);
  },

  getStatus(uploadId: string): Promise<ApiResponse<UploadRegistration>> {
    return apiClient.request(`/uploads/${encodeURIComponent(uploadId)}`);
  },

  schedule(uploadId: string): Promise<ApiResponse<UploadScheduleResponse>> {
    return apiClient.request(`/uploads/${encodeURIComponent(uploadId)}/schedule`, {
      method: 'POST',
    });
  },

  execute(uploadId: string, runNow: boolean): Promise<ApiResponse<UploadRegistration>> {
    return apiClient.request(`/uploads/${encodeURIComponent(uploadId)}/execute`, {
      method: 'POST',
      body: JSON.stringify({ runNow }),
    });
  },

  async download(upload: UploadRegistration): Promise<void> {
    const token = typeof window === 'undefined'
      ? null
      : window.localStorage.getItem('ecotime_token');
    const response = await fetch(`${API_BASE}/uploads/${encodeURIComponent(upload.id)}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      throw new Error(`File download failed (HTTP ${response.status})`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = upload.filename;
    anchor.click();
    URL.revokeObjectURL(url);
  },
};
