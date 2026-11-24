import { NextRequest, NextResponse } from "next/server";
import { applySessionSwitchOnResponse } from "@/lib/auth";
import { RoleEnum } from "@/contracts/lead-contracts";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tenantSlug = req.nextUrl.searchParams.get("tenant") || "apex-roofing";
  const roleParam = req.nextUrl.searchParams.get("role");
  const returnTo = req.nextUrl.searchParams.get("returnTo") || "/dashboard";

  const parsedRole = roleParam ? RoleEnum.safeParse(roleParam.toUpperCase()) : null;
  const safePath = returnTo.startsWith("/") ? returnTo : "/dashboard";

  const res = NextResponse.redirect(new URL(safePath, req.url), 303);
  res.headers.set("Cache-Control", "no-store, max-age=0");

  await applySessionSwitchOnResponse(
    req,
    res,
    tenantSlug,
    parsedRole?.success ? parsedRole.data : undefined
  );

  return res;
}
