import { NextRequest, NextResponse } from "next/server";
import { switchTenantSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tenantSlug = req.nextUrl.searchParams.get("tenant") || "apex-roofing";
  const returnTo = req.nextUrl.searchParams.get("returnTo") || "/dashboard";
  
  await switchTenantSession(tenantSlug);

  return NextResponse.redirect(new URL(returnTo, req.url), 303);
}
