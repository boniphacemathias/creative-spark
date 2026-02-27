import {
  CampaignApproval,
  CampaignIssue,
  CampaignReminder,
  CampaignSnapshot,
  WorkflowStage,
} from "@/types/campaign";
import { appendRequestIdToErrorMessage, buildJsonHeaders } from "@/lib/api/request-tracing";
import { getActiveWorkspaceId } from "@/lib/workspace";

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
    const message = (payload.error || payload.message || `Enhancement API failed: ${response.status}`).trim();
    throw new Error(appendRequestIdToErrorMessage(message, response));
  }

  return (await response.json()) as T;
}

export interface CampaignHealthResponse {
  campaignId: string;
  completionPercent: number;
  unresolvedComments: number;
  overdueIssues: number;
  preflightScore: number;
  currentStage: WorkflowStage;
  riskHeatmap: Array<{ label: string; score: number }>;
  conceptQualityTrend: Array<{ label: string; score: number }>;
}

export interface PreflightApiResponse {
  score: number;
  passThreshold: number;
  passed: boolean;
  checks: Array<{
    id: string;
    label: string;
    passed: boolean;
    severity: "info" | "warning" | "critical";
    recommendation: string;
  }>;
}

export interface SnapshotDiffResponse {
  baseId: string;
  targetId: string;
  summary: string;
  changes: Array<{ key: string; before: string; after: string }>;
}

export interface WorkspaceNotification {
  id: string;
  campaignId: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
  createdAt: string;
}

export async function getCampaignHealth(campaignId: string): Promise<CampaignHealthResponse> {
  return requestJson<CampaignHealthResponse>(`/api/campaigns/${encodeURIComponent(campaignId)}/health`);
}

export async function transitionCampaignStage(
  campaignId: string,
  stage: WorkflowStage,
  actor: string,
): Promise<{ stage: WorkflowStage; stageUpdatedAt: string; wipLimit: number }> {
  return requestJson<{ stage: WorkflowStage; stageUpdatedAt: string; wipLimit: number }>(
    `/api/campaigns/${encodeURIComponent(campaignId)}/stage-transition`,
    {
      method: "POST",
      body: JSON.stringify({ stage, actor }),
    },
  );
}

export async function getCampaignPreflight(campaignId: string): Promise<PreflightApiResponse> {
  return requestJson<PreflightApiResponse>(`/api/campaigns/${encodeURIComponent(campaignId)}/preflight`);
}

export async function listCampaignIssues(campaignId: string): Promise<CampaignIssue[]> {
  return requestJson<CampaignIssue[]>(`/api/campaigns/${encodeURIComponent(campaignId)}/incidents`);
}

export async function createCampaignIssue(
  campaignId: string,
  payload: { title: string; description: string; severity: CampaignIssue["severity"]; owner: string; slaHours: number },
): Promise<CampaignIssue> {
  return requestJson<CampaignIssue>(`/api/campaigns/${encodeURIComponent(campaignId)}/incidents`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateCampaignIssue(
  campaignId: string,
  issueId: string,
  payload: Partial<Pick<CampaignIssue, "status" | "owner" | "postmortem" | "severity">>,
): Promise<CampaignIssue> {
  return requestJson<CampaignIssue>(
    `/api/campaigns/${encodeURIComponent(campaignId)}/incidents/${encodeURIComponent(issueId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteCampaignIssue(
  campaignId: string,
  issueId: string,
): Promise<{ deleted: boolean }> {
  return requestJson<{ deleted: boolean }>(
    `/api/campaigns/${encodeURIComponent(campaignId)}/incidents/${encodeURIComponent(issueId)}`,
    {
      method: "DELETE",
    },
  );
}

export async function listCampaignReminders(campaignId: string): Promise<CampaignReminder[]> {
  return requestJson<CampaignReminder[]>(`/api/campaigns/${encodeURIComponent(campaignId)}/reminders`);
}

export async function listCampaignSnapshots(campaignId: string): Promise<CampaignSnapshot[]> {
  return requestJson<CampaignSnapshot[]>(`/api/campaigns/${encodeURIComponent(campaignId)}/versions`);
}

export async function createCampaignSnapshot(
  campaignId: string,
  label: string,
  createdBy: string,
): Promise<CampaignSnapshot> {
  return requestJson<CampaignSnapshot>(`/api/campaigns/${encodeURIComponent(campaignId)}/versions`, {
    method: "POST",
    body: JSON.stringify({ label, createdBy }),
  });
}

export async function deleteCampaignSnapshot(
  campaignId: string,
  snapshotId: string,
): Promise<{ deleted: boolean }> {
  return requestJson<{ deleted: boolean }>(
    `/api/campaigns/${encodeURIComponent(campaignId)}/versions/${encodeURIComponent(snapshotId)}`,
    {
      method: "DELETE",
    },
  );
}

export async function compareCampaignSnapshots(
  campaignId: string,
  baseId: string,
  targetId: string,
): Promise<SnapshotDiffResponse> {
  return requestJson<SnapshotDiffResponse>(
    `/api/campaigns/${encodeURIComponent(campaignId)}/versions/compare?base=${encodeURIComponent(baseId)}&target=${encodeURIComponent(targetId)}`,
  );
}

export async function listCampaignApprovals(campaignId: string): Promise<CampaignApproval[]> {
  return requestJson<CampaignApproval[]>(`/api/campaigns/${encodeURIComponent(campaignId)}/approvals`);
}

export async function createCampaignApproval(
  campaignId: string,
  payload: Pick<CampaignApproval, "role" | "approver" | "signature"> & {
    note?: string;
    status?: CampaignApproval["status"];
  },
): Promise<CampaignApproval> {
  return requestJson<CampaignApproval>(`/api/campaigns/${encodeURIComponent(campaignId)}/approvals`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateCampaignApproval(
  campaignId: string,
  approvalId: string,
  payload: Partial<Pick<CampaignApproval, "status" | "note" | "approver" | "signature">>,
): Promise<CampaignApproval> {
  return requestJson<CampaignApproval>(
    `/api/campaigns/${encodeURIComponent(campaignId)}/approvals/${encodeURIComponent(approvalId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteCampaignApproval(
  campaignId: string,
  approvalId: string,
): Promise<{ deleted: boolean }> {
  return requestJson<{ deleted: boolean }>(
    `/api/campaigns/${encodeURIComponent(campaignId)}/approvals/${encodeURIComponent(approvalId)}`,
    {
      method: "DELETE",
    },
  );
}

export async function listWorkspaceNotifications(): Promise<WorkspaceNotification[]> {
  return requestJson<WorkspaceNotification[]>("/api/notifications");
}
