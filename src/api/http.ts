import type { IncomingMessage, ServerResponse } from "node:http";
import { AppError, type ErrorCode } from "../domain/errors.js";

const statusByCode: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
};

export function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}

export async function readJson(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  return parseJsonObject(await readBody(request));
}

/**
 * Like readJson, but an empty body is treated as an empty object. Use it for
 * actions whose meaning comes entirely from the URL and the session.
 */
export async function readOptionalJson(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  const text = await readBody(request);
  return text.trim().length === 0 ? {} : parseJsonObject(text);
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let bytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 1_000_000) {
      throw new AppError("bad_request", "Request body is too large.");
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function parseJsonObject(text: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("not an object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new AppError("bad_request", "Request body must be a JSON object.");
  }
}

export function sendError(response: ServerResponse, error: unknown): void {
  if (error instanceof AppError) {
    sendJson(response, statusByCode[error.code], {
      error: error.code,
      message: error.message,
      details: error.details,
    });
    return;
  }

  console.error(error);
  sendJson(response, 500, {
    error: "internal_error",
    message: "An unexpected error occurred.",
  });
}

export function requireString(
  value: unknown,
  field: string,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new AppError("bad_request", `'${field}' must be a non-empty string.`);
  }
  return value;
}
