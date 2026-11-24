import { NextRequest, NextResponse } from "next/server";
import { switchTenantSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const tenantSlug = req.nextUrl.searchParams.get("tenant") || "apex-roofing";
  try {
    await switchTenantSession(tenantSlug);
  } catch (e) {
    // If switch fails, continue gracefully
  }
  return NextResponse.redirect(new URL("/dashboard", req.url));
}
