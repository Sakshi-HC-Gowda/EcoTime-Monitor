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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isUploadRegistration(value: unknown): value is UploadRegistration {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.activityId === 'string'
    && typeof value.filename === 'string'
    && typeof value.size === 'number'
    && Number.isFinite(value.size)
    && typeof value.contentType === 'string'
    && ['pending', 'scheduled', 'running', 'completed', 'failed'].includes(String(value.status))
    && isNullableString(value.scheduledStartTime)
    && isNullableString(value.recommendationReason)
    && isNullableString(value.windowId)
    && isNullableString(value.uploadedAt)
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string'
    && isNullableString(value.error)
    && isNullableString(value.downloadUrl);
}

function isUploadScheduleResponse(value: unknown): value is UploadScheduleResponse {
  if (!isRecord(value) || !isUploadRegistration(value.upload) || !isRecord(value.recommendation)) {
    return false;
  }
  const recommendation = value.recommendation;
  return typeof recommendation.activityId === 'string'
    && typeof recommendation.recommendation === 'string'
    && typeof recommendation.reason === 'string'
    && ['scheduled', 'not_scheduled'].includes(String(recommendation.status))
    && isNullableString(recommendation.windowId)
    && isNullableString(recommendation.startTime);
}

async function requestValidated<T>(
  endpoint: string,
  isExpectedData: (value: unknown) => value is T,
  options?: RequestInit,
): Promise<ApiResponse<T>> {
  const response = await apiClient.request<unknown>(endpoint, options);
  if (!response.success) {
    return {
      success: false,
      error: response.error || 'Upload request failed',
      timestamp: response.timestamp,
    };
  }
  if (!isExpectedData(response.data)) {
    return {
      success: false,
      error: 'Invalid upload response',
      timestamp: response.timestamp,
    };
  }
  return { ...response, data: response.data };
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
      let json: unknown;
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        fail('Invalid upload response');
        return;
      }

      const timestamp = isRecord(json) && typeof json.timestamp === 'string'
        ? json.timestamp
        : new Date().toISOString();
      if (xhr.status >= 200 && xhr.status < 300) {
        if (!isRecord(json) || !isUploadRegistration(json.data)) {
          fail('Invalid upload response');
          return;
        }
        onProgress?.(100);
        resolve({ success: true, data: json.data, timestamp });
        return;
      }

      resolve({
        success: false,
        error: isRecord(json) && typeof json.error === 'string'
          ? json.error
          : `HTTP ${xhr.status}: ${xhr.statusText}`,
        timestamp,
      });
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
    return requestValidated(
      `/activities/${encodeURIComponent(activityId)}/uploads`,
      (value): value is UploadRegistration[] =>
        Array.isArray(value) && value.every(isUploadRegistration),
    );
  },

  getStatus(uploadId: string): Promise<ApiResponse<UploadRegistration>> {
    return requestValidated(
      `/uploads/${encodeURIComponent(uploadId)}`,
      isUploadRegistration,
    );
  },

  schedule(uploadId: string): Promise<ApiResponse<UploadScheduleResponse>> {
    return requestValidated(
      `/uploads/${encodeURIComponent(uploadId)}/schedule`,
      isUploadScheduleResponse,
      { method: 'POST' },
    );
  },

  execute(uploadId: string, runNow: boolean): Promise<ApiResponse<UploadRegistration>> {
    return requestValidated(
      `/uploads/${encodeURIComponent(uploadId)}/execute`,
      isUploadRegistration,
      {
        method: 'POST',
        body: JSON.stringify({ runNow }),
      },
    );
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
