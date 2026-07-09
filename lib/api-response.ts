import { NextResponse } from "next/server";
import type { ZodError } from "zod";

/**
 * Consistent JSON envelope for every route under app/api/, per the
 * `api-design` and `error-handling` skills:
 *   success -> { data: T }
 *   error   -> { error: { code, message, details? } }
 * `code` is a stable, lowercase snake_case string clients can switch on;
 * `message` is safe to show a human; `details` carries field-level Zod
 * validation errors when present.
 */

export type FieldError = {
  field: string;
  message: string;
  code: string;
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: FieldError[];
  };
};

export function apiSuccess<T>(data: T, init?: { status?: number; headers?: HeadersInit }) {
  return NextResponse.json({ data }, { status: init?.status ?? 200, headers: init?.headers });
}

export function apiError(status: number, code: string, message: string, details?: FieldError[]) {
  const body: ApiErrorBody = { error: { code, message, ...(details ? { details } : {}) } };
  return NextResponse.json(body, { status });
}

export function unauthorized(message = "Authentication required.") {
  return apiError(401, "unauthorized", message);
}

export function notFound(resource: string) {
  return apiError(404, "not_found", `${resource} not found.`);
}

export function badRequest(message: string) {
  return apiError(400, "bad_request", message);
}

export function conflict(message: string) {
  return apiError(409, "conflict", message);
}

export function validationError(error: ZodError) {
  const details: FieldError[] = error.issues.map((issue) => ({
    field: issue.path.join(".") || "(root)",
    message: issue.message,
    code: issue.code,
  }));
  return apiError(400, "validation_error", "Request validation failed.", details);
}

export function internalError(error: unknown) {
  console.error("Unexpected API error:", error);
  return apiError(500, "internal_error", "An unexpected error occurred.");
}
