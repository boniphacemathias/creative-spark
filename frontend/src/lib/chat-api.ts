import { CampaignData } from "@/types/campaign";
import { ChatMessage } from "@/lib/ai-chat/chat-engine";
import { appendRequestIdToErrorMessage, buildJsonHeaders } from "@/lib/api/request-tracing";
import { getActiveWorkspaceId } from "@/lib/workspace";

export type AIProvider = "openrouter" | "gemini";

const API_BASE_URL =
  (typeof import.meta.env.VITE_CAMPAIGN_API_BASE_URL === "string"
    ? import.meta.env.VITE_CAMPAIGN_API_BASE_URL.trim().replace(/\/$/, "")
    : "") || "http://127.0.0.1:8787";
const API_AUTH_TOKEN = (typeof import.meta.env.VITE_BACKEND_AUTH_TOKEN === "string"
  ? import.meta.env.VITE_BACKEND_AUTH_TOKEN.trim()
  : "");

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
    const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
    const upstreamMessage = (payload.error || payload.message || "").trim();
    const normalizedUpstreamMessage = upstreamMessage.toLowerCase();

    let errorMessage = upstreamMessage;
    if (response.status === 404) {
      errorMessage = normalizedUpstreamMessage.includes("assistant not found")
        ? "Assistant not found"
        : "Chat API route not found. Verify backend is running and VITE_CAMPAIGN_API_BASE_URL points to the campaign backend.";
    } else if (!errorMessage) {
      errorMessage = `Chat API request failed: ${response.status}`;
    }

    throw new Error(appendRequestIdToErrorMessage(errorMessage, response));
  }

  return (await response.json()) as T;
}

export async function listChatMessages(campaignId: string | null): Promise<ChatMessage[]> {
  const params = new URLSearchParams();
  if (campaignId) {
    params.set("campaignId", campaignId);
  }
  return requestJson<ChatMessage[]>(`/api/chat/messages?${params.toString()}`);
}

export async function clearChatMessages(campaignId: string | null): Promise<ChatMessage[]> {
  const params = new URLSearchParams();
  if (campaignId) {
    params.set("campaignId", campaignId);
  }
  return requestJson<ChatMessage[]>(`/api/chat/messages?${params.toString()}`, {
    method: "DELETE",
  });
}

export async function appendChatMessageApi(
  campaignId: string | null,
  message: ChatMessage,
): Promise<ChatMessage> {
  return requestJson<ChatMessage>("/api/chat/messages", {
    method: "POST",
    body: JSON.stringify({
      campaignId,
      message,
    }),
  });
}

export async function runChatTurnApi(input: {
  prompt: string;
  campaign: CampaignData | null;
  includeExternal?: boolean;
  provider?: AIProvider;
  taggedDocumentIds?: string[];
}): Promise<{ message: ChatMessage; messages: ChatMessage[] }> {
  return requestJson<{ message: ChatMessage; messages: ChatMessage[] }>("/api/chat/turn", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
