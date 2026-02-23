export type CampaignErrorCode =
  | "STORAGE_READ_FAILED"
  | "STORAGE_WRITE_FAILED"
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNKNOWN";

export class CampaignError extends Error {
  readonly code: CampaignErrorCode;
  readonly details?: unknown;

  constructor(code: CampaignErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "CampaignError";
    this.code = code;
    this.details = details;
  }
}

export function toCampaignError(error: unknown, fallbackCode: CampaignErrorCode, fallbackMessage: string): CampaignError {
  if (error instanceof CampaignError) {
    return error;
  }

  if (error instanceof Error) {
    return new CampaignError(fallbackCode, error.message, error);
  }

  return new CampaignError(fallbackCode, fallbackMessage, error);
}
