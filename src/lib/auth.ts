import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { SessionData, sessionOptions, defaultSession } from "./session";
import { prisma } from "./prisma";

export async function getCurrentSession(): Promise<SessionData> {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

  if (!session.isLoggedIn) {
    try {
      // If not logged in, auto-login as Demo Admin for immediate 1-click preview
      const defaultTenant = await prisma.tenant.findUnique({
        where: { slug: "apex-roofing" },
      });
      const defaultUser = await prisma.user.findUnique({
        where: { email: "admin@apexroofing.com" },
      });

      if (defaultTenant && defaultUser) {
        session.userId = defaultUser.id;
        session.userEmail = defaultUser.email;
        session.userName = defaultUser.name;
        session.tenantId = defaultTenant.id;
        session.tenantName = defaultTenant.name;
        session.role = "ADMIN";
        session.isLoggedIn = true;
        await session.save();
      } else {
        return {
          userId: "demo_admin_fallback",
          userEmail: "admin@apexroofing.com",
          userName: "Marcus Vance (Ops Lead)",
          tenantId: "demo_tenant_apex",
          tenantName: "Apex Roofing TX",
          role: "ADMIN",
          isLoggedIn: true,
        };
      }
    } catch (e) {
      // Database not ready yet, provide instant demo session
      return {
        userId: "demo_admin_fallback",
        userEmail: "admin@apexroofing.com",
        userName: "Marcus Vance (Ops Lead)",
        tenantId: "demo_tenant_apex",
        tenantName: "Apex Roofing TX",
        role: "ADMIN",
        isLoggedIn: true,
      };
    }
  }

  return session;
}

export async function switchTenantSession(tenantSlug: string): Promise<SessionData> {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });

    if (tenant) {
      session.tenantId = tenant.id;
      session.tenantName = tenant.name;

      if (session.userId) {
        const membership = await prisma.membership.findFirst({
          where: {
            userId: session.userId,
            tenantId: tenant.id,
          },
        });
        if (membership) {
          session.role = (membership.role as any) || "VIEWER";
        }
      }
      session.isLoggedIn = true;
      await session.save();
      return session;
    }
  } catch (e) {
    // If database unavailable, fallback to demo tenant switching
  }

  // Pure memory/cookie fallback for instant demo workspace switching
  if (tenantSlug === "summit-solar") {
    session.tenantId = "demo_tenant_summit";
    session.tenantName = "Summit Solar AU";
    session.role = "OWNER";
  } else {
    session.tenantId = "demo_tenant_apex";
    session.tenantName = "Apex Roofing TX";
    session.role = "ADMIN";
  }
  session.userId = session.userId || "demo_admin_fallback";
  session.userName = session.userName || "Marcus Vance (Ops Lead)";
  session.userEmail = session.userEmail || "admin@apexroofing.com";
  session.isLoggedIn = true;
  await session.save();

  return session;
}
