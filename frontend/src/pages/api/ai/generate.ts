import {
  getHuggingFaceService,
  HUGGINGFACE_GENERATION_FALLBACK,
  HuggingFaceServiceError,
} from "../../../server/ai/huggingface.service";

const MAX_PROMPT_LENGTH = 12_000;

export interface GenerateRequestBody {
  prompt: string;
}

export interface GenerateResponseBody {
  success: boolean;
  result: string;
}

function normalizePrompt(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function jsonResponse(status: number, body: GenerateResponseBody): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export async function handleGeneratePayload(payload: unknown): Promise<{ status: number; body: GenerateResponseBody }> {
  const prompt = normalizePrompt((payload as Partial<GenerateRequestBody> | null)?.prompt);

  if (!prompt) {
    return {
      status: 400,
      body: { success: false, result: "Prompt is required." },
    };
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    return {
      status: 413,
      body: { success: false, result: "Prompt is too long." },
    };
  }

  try {
    const result = await getHuggingFaceService().generateText(prompt);
    return {
      status: 200,
      body: {
        success: true,
        result,
      },
    };
  } catch (error) {
    if (error instanceof HuggingFaceServiceError) {
      const status = error.status >= 400 && error.status < 600 ? error.status : 500;
      return {
        status,
        body: {
          success: false,
          result: HUGGINGFACE_GENERATION_FALLBACK,
        },
      };
    }

    return {
      status: 500,
      body: {
        success: false,
        result: HUGGINGFACE_GENERATION_FALLBACK,
      },
    };
  }
}

export async function handleGenerateRequest(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse(405, { success: false, result: "Method not allowed." });
  }

  let payload: unknown = {};
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { success: false, result: "Invalid JSON payload." });
  }

  const result = await handleGeneratePayload(payload);
  return jsonResponse(result.status, result.body);
}
