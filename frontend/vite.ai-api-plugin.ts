import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect } from "vite";
import type { Plugin } from "vite";
import { handleGeneratePayload } from "./src/pages/api/ai/generate";

async function readRequestBody(request: IncomingMessage): Promise<string> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    request.on("error", (error) => {
      reject(error);
    });
  });
}

function writeJson(response: ServerResponse, status: number, payload: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

async function handleGenerateApi(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== "POST") {
    writeJson(response, 405, { success: false, result: "Method not allowed." });
    return;
  }

  let rawBody = "";
  try {
    rawBody = await readRequestBody(request);
  } catch {
    writeJson(response, 400, { success: false, result: "Invalid JSON payload." });
    return;
  }

  let payload: unknown = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    writeJson(response, 400, { success: false, result: "Invalid JSON payload." });
    return;
  }

  const result = await handleGeneratePayload(payload);
  writeJson(response, result.status, result.body);
}

function attachMiddleware(server: { middlewares: Connect.Server }): void {
  server.middlewares.use(async (request, response, next) => {
    const url = request.url ?? "";

    if (url !== "/api/ai/generate") {
      next();
      return;
    }

    await handleGenerateApi(request, response);
  });
}

export function aiApiPlugin(): Plugin {
  return {
    name: "ai-api-plugin",
    apply: "serve",
    configureServer(server) {
      attachMiddleware(server);
    },
    configurePreviewServer(server) {
      attachMiddleware(server);
    },
  };
}
