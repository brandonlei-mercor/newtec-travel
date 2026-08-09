import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/shared/errors";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function handleRouteError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Please correct the highlighted fields",
          fieldErrors: error.flatten().fieldErrors
        }
      },
      { status: 422 }
    );
  }
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status }
    );
  }
  if (
    error instanceof Error &&
    "status" in error &&
    "code" in error &&
    typeof (error as { status?: unknown }).status === "number" &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    const domainError = error as Error & {
      status: number;
      code: string;
      details?: Record<string, unknown>;
    };
    return NextResponse.json(
      {
        error: {
          code: domainError.code,
          message: domainError.message,
          details: domainError.details
        }
      },
      { status: domainError.status }
    );
  }
  console.error("Unhandled route error", error);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } },
    { status: 500 }
  );
}
