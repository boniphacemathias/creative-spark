import { CampaignData } from "@/types/campaign";

export interface PreflightCheck {
  id: string;
  label: string;
  passed: boolean;
  severity: "info" | "warning" | "critical";
  recommendation: string;
}

export interface PreflightReport {
  score: number;
  passThreshold: number;
  passed: boolean;
  checks: PreflightCheck[];
}

function hasText(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

export const PREFLIGHT_THRESHOLD = 72;

export function runPreflightChecks(data: CampaignData): PreflightReport {
  const checks: PreflightCheck[] = [
    {
      id: "objective_defined",
      label: "Business and communication objectives are defined",
      passed: hasText(data.businessObjective) && hasText(data.communicationObjective),
      severity: "critical",
      recommendation: "Complete both objective fields in Communication Brief.",
    },
    {
      id: "audience_ready",
      label: "At least one audience has message + CTA",
      passed: data.audiences.some((entry) => hasText(entry.keyMessage) && hasText(entry.cta)),
      severity: "critical",
      recommendation: "Add key message and CTA for your primary audience.",
    },
    {
      id: "creative_proposition",
      label: "Creative proposition and deliverables are complete",
      passed:
        hasText(data.creativeBrief.keyProposition) &&
        data.creativeBrief.deliverables.some((entry) => hasText(entry.asset) && hasText(entry.platform)),
      severity: "critical",
      recommendation: "Define proposition and ensure deliverable specs are filled.",
    },
    {
      id: "ideation_pool",
      label: "4Rs ideation has >= 8 ideas and >= 2 selected",
      passed: data.ideas.length >= 8 && data.ideas.filter((entry) => entry.selected).length >= 2,
      severity: "warning",
      recommendation: "Generate more ideas and select top performers.",
    },
    {
      id: "concept_ready",
      label: "Concept pack has at least one shortlisted/final concept",
      passed: data.concepts.some((entry) => entry.status === "shortlisted" || entry.status === "final"),
      severity: "critical",
      recommendation: "Shortlist at least one concept before submission.",
    },
    {
      id: "evidence_linked",
      label: "Evidence registry has source-backed claims",
      passed: (data.evidenceItems || []).some((entry) => hasText(entry.claim) && hasText(entry.source)),
      severity: "warning",
      recommendation: "Link major claims to evidence with confidence ratings.",
    },
    {
      id: "approval_signed",
      label: "Minimum one approval signature exists",
      passed: (data.approvals || []).some((entry) => entry.status === "approved"),
      severity: "critical",
      recommendation: "Capture at least one role-based approval signature.",
    },
    {
      id: "issues_clear",
      label: "No unresolved critical incidents",
      passed: !(data.issues || []).some((entry) => entry.severity === "critical" && entry.status !== "resolved"),
      severity: "critical",
      recommendation: "Resolve or downgrade critical incidents before export.",
    },
  ];

  const weightedScore = checks.reduce((sum, check) => {
    const weight = check.severity === "critical" ? 16 : check.severity === "warning" ? 11 : 8;
    return sum + (check.passed ? weight : 0);
  }, 0);
  const maxScore = checks.reduce((sum, check) => {
    const weight = check.severity === "critical" ? 16 : check.severity === "warning" ? 11 : 8;
    return sum + weight;
  }, 0);
  const score = Math.round((weightedScore / Math.max(1, maxScore)) * 100);

  return {
    score,
    passThreshold: PREFLIGHT_THRESHOLD,
    passed: score >= PREFLIGHT_THRESHOLD,
    checks,
  };
}
