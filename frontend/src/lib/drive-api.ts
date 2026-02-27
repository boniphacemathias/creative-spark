import { DriveEntry, DriveFile, DriveFolder } from "@/lib/drive-storage";
import {
  appendRequestIdToErrorMessage,
  buildJsonHeaders,
  createRequestId,
} from "@/lib/api/request-tracing";
import { getActiveWorkspaceId } from "@/lib/workspace";

const API_BASE_URL =
  import.meta.env.VITE_CAMPAIGN_API_BASE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8787";
const API_AUTH_TOKEN = (typeof import.meta.env.VITE_BACKEND_AUTH_TOKEN === "string"
  ? import.meta.env.VITE_BACKEND_AUTH_TOKEN.trim()
  : "");

function buildAuthHeaders(): Record<string, string> {
  if (!API_AUTH_TOKEN) {
    return {};
  }

  return {
    Authorization: `Bearer ${API_AUTH_TOKEN}`,
    "X-API-Key": API_AUTH_TOKEN,
  };
}

function buildDriveHeaders(initHeaders?: HeadersInit): Headers {
  const headers = new Headers(initHeaders);
  const authHeaders = buildAuthHeaders();
  for (const [key, value] of Object.entries(authHeaders)) {
    headers.set(key, value);
  }
  headers.set("X-Workspace-Id", getActiveWorkspaceId());
  if (!headers.has("X-Request-Id")) {
    headers.set("X-Request-Id", createRequestId("drive"));
  }
  return headers;
}

function readDownloadFilename(contentDisposition: string | null, fallback: string): string {
  const value = String(contentDisposition || "");
  if (!value) {
    return fallback;
  }

  const encodedMatch = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {
      return encodedMatch[1];
    }
  }

  const quotedMatch = value.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  const plainMatch = value.match(/filename=([^;]+)/i);
  if (plainMatch?.[1]) {
    return plainMatch[1].trim();
  }

  return fallback;
}

function isTextLikeFile(file: File): boolean {
  const mimeType = (file.type || "").toLowerCase();
  const loweredName = file.name.toLowerCase();
  return (
    mimeType.startsWith("text/") ||
    mimeType.includes("json") ||
    mimeType.includes("csv") ||
    loweredName.endsWith(".txt") ||
    loweredName.endsWith(".csv") ||
    loweredName.endsWith(".json") ||
    loweredName.endsWith(".md")
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, Math.min(index + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }

  if (typeof btoa === "function") {
    return btoa(binary);
  }

  throw new Error("Base64 encoding is not available in this environment.");
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: buildJsonHeaders(init?.headers, {
      ...buildAuthHeaders(),
      "X-Workspace-Id": getActiveWorkspaceId(),
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    const message = payload.error || `Drive API request failed: ${response.status}`;
    throw new Error(appendRequestIdToErrorMessage(message, response));
  }

  return (await response.json()) as T;
}

export async function listDriveEntries(
  folderId: string | null,
  searchQuery = "",
  campaignId: string | null = null,
): Promise<DriveEntry[]> {
  const params = new URLSearchParams();
  if (folderId) {
    params.set("folderId", folderId);
  }
  if (campaignId) {
    params.set("campaignId", campaignId);
  }
  if (searchQuery.trim()) {
    params.set("query", searchQuery.trim());
  }
  return requestJson<DriveEntry[]>(`/api/drive/entries?${params.toString()}`);
}

export async function listDriveFolders(campaignId: string | null = null): Promise<DriveFolder[]> {
  const params = new URLSearchParams();
  if (campaignId) {
    params.set("campaignId", campaignId);
  }
  return requestJson<DriveFolder[]>(`/api/drive/folders?${params.toString()}`);
}

export async function getDriveBreadcrumbs(
  folderId: string | null,
  campaignId: string | null = null,
): Promise<DriveFolder[]> {
  const params = new URLSearchParams();
  if (folderId) {
    params.set("folderId", folderId);
  }
  if (campaignId) {
    params.set("campaignId", campaignId);
  }
  return requestJson<DriveFolder[]>(`/api/drive/breadcrumbs?${params.toString()}`);
}

export async function listDriveFiles(campaignId: string | null = null): Promise<DriveFile[]> {
  const params = new URLSearchParams();
  if (campaignId) {
    params.set("campaignId", campaignId);
  }
  return requestJson<DriveFile[]>(`/api/drive/files?${params.toString()}`);
}

export interface DownloadDriveFilePayload {
  blob: Blob;
  fileName: string;
  mimeType: string;
}

export async function downloadDriveFile(
  id: string,
  campaignId: string | null = null,
): Promise<DownloadDriveFilePayload> {
  const params = new URLSearchParams();
  if (campaignId) {
    params.set("campaignId", campaignId);
  }
  const query = params.toString();
  const suffix = query ? `?${query}` : "";

  const response = await fetch(`${API_BASE_URL}/api/drive/files/${encodeURIComponent(id)}/download${suffix}`, {
    method: "GET",
    headers: buildDriveHeaders(),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    const message = payload.error || `Drive download failed: ${response.status}`;
    throw new Error(appendRequestIdToErrorMessage(message, response));
  }

  const blob = await response.blob();
  return {
    blob,
    fileName: readDownloadFilename(response.headers.get("content-disposition"), `drive-file-${id}`),
    mimeType: response.headers.get("content-type") || blob.type || "application/octet-stream",
  };
}

export async function createDriveFolder(
  name: string,
  parentId: string | null = null,
  campaignId: string | null = null,
): Promise<DriveFolder> {
  return requestJson<DriveFolder>("/api/drive/folders", {
    method: "POST",
    body: JSON.stringify({ name, parentId, campaignId }),
  });
}

export async function uploadDriveFile(
  file: File,
  folderId: string | null = null,
  campaignId: string | null = null,
): Promise<DriveFile> {
  const [arrayBuffer, textContent] = await Promise.all([
    file.arrayBuffer(),
    isTextLikeFile(file) ? file.text() : Promise.resolve(""),
  ]);

  return requestJson<DriveFile>("/api/drive/files", {
    method: "POST",
    body: JSON.stringify({
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      content: textContent,
      contentBase64: arrayBufferToBase64(arrayBuffer),
      folderId,
      campaignId,
    }),
  });
}

export async function renameDriveEntry(
  id: string,
  name: string,
  campaignId: string | null = null,
): Promise<DriveEntry> {
  return requestJson<DriveEntry>(`/api/drive/entries/${encodeURIComponent(id)}/rename`, {
    method: "PATCH",
    body: JSON.stringify({ name, campaignId }),
  });
}

export async function moveDriveEntry(
  id: string,
  destinationFolderId: string | null,
  campaignId: string | null = null,
): Promise<DriveEntry> {
  return requestJson<DriveEntry>(`/api/drive/entries/${encodeURIComponent(id)}/move`, {
    method: "PATCH",
    body: JSON.stringify({ destinationFolderId, campaignId }),
  });
}

export async function deleteDriveEntry(id: string, campaignId: string | null = null): Promise<boolean> {
  const params = new URLSearchParams();
  if (campaignId) {
    params.set("campaignId", campaignId);
  }
  const result = await requestJson<{ deleted: boolean }>(
    `/api/drive/entries/${encodeURIComponent(id)}?${params.toString()}`,
    {
      method: "DELETE",
    },
  );
  return result.deleted;
}
