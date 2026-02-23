import { DriveEntry, DriveFile, DriveFolder } from "@/lib/drive-storage";
import { appendRequestIdToErrorMessage, buildJsonHeaders } from "@/lib/api/request-tracing";
import { getActiveWorkspaceId } from "@/lib/workspace";

const API_BASE_URL =
  import.meta.env.VITE_CAMPAIGN_API_BASE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8787";
const API_AUTH_TOKEN = (typeof import.meta.env.VITE_BACKEND_AUTH_TOKEN === "string"
  ? import.meta.env.VITE_BACKEND_AUTH_TOKEN.trim()
  : "");

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
  const authHeaders =
    API_AUTH_TOKEN
      ? {
          Authorization: `Bearer ${API_AUTH_TOKEN}`,
          "X-API-Key": API_AUTH_TOKEN,
        }
      : {};

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: buildJsonHeaders(init?.headers, {
      ...authHeaders,
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
