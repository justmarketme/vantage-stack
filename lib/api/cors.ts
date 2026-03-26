import { NextResponse } from "next/server";

function parseOrigins(value: string) {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function getAllowedOrigins() {
  const configured = (process.env.CORS_ORIGINS || "").trim();
  if (configured) return parseOrigins(configured);
  return ["http://localhost:3005"];
}

export function getCorsOrigin(request: Request) {
  const origin = (request.headers.get("origin") || "").trim();
  if (!origin) return "";
  const allowed = getAllowedOrigins();
  return allowed.includes(origin) ? origin : "";
}

export function withCors(response: NextResponse, request: Request) {
  const allowedOrigin = getCorsOrigin(request);
  if (allowedOrigin) {
    response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
    response.headers.set("Vary", "Origin");
  }
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.headers.set("Access-Control-Max-Age", "86400");
  return response;
}

export function corsPreflight(request: Request) {
  return withCors(new NextResponse(null, { status: 204 }), request);
}
