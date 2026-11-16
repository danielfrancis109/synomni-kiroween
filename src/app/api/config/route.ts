import { NextResponse } from "next/server";
import { securityHeaders } from "@/lib/security";

export async function GET(): Promise<NextResponse> {
  const headers = securityHeaders();
  const hosted = process.env.HOSTED_DEMO === "true";
  return NextResponse.json({ hosted }, { headers });
}
