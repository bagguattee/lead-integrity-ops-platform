import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { SessionData, sessionOptions, defaultSession } from "./session";
import { getTenantSnapshot, resolveTenantSlug } from "./store";
import { UserRole } from "../contracts/lead-contracts";

/**
 * Strictly read-only session resolver safe for React Server Components AND Server Actions.
 * Never mutates cookies during RSC render.
 */
export async function getCurrentSession(): Promise<SessionData> {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (session.isLoggedIn && (session.tenantSlug || session.tenantId)) {
      const slug = resolveTenantSlug(session.tenantSlug || session.tenantId);
      const snap = getTenantSnapshot(slug);
      return {
        userId: session.userId || defaultSession.userId,
        userEmail: session.userEmail || defaultSession.userEmail,
        userName: session.userName || defaultSession.userName,
        tenantId: snap.tenant.id,
        tenantSlug: snap.tenant.slug,
        tenantName: snap.tenant.name,
        role: session.role || "ADMIN",
        isLoggedIn: true,
      };
    }
  } catch {
    // Fallback cleanly if invoked outside request context
  }

  return { ...defaultSession };
}

/**
 * Mutates encrypted iron-session cookie directly on a Next.js Request/Response pair (Route Handlers).
 */
export async function applySessionSwitchOnResponse(
  req: Request,
  res: Response,
  tenantSlugInput: string,
  roleOverride?: UserRole
): Promise<SessionData> {
  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  const slug = resolveTenantSlug(tenantSlugInput);
  const snap = getTenantSnapshot(slug);

  session.userId = session.userId || defaultSession.userId;
  session.userEmail = session.userEmail || defaultSession.userEmail;
  session.userName = session.userName || defaultSession.userName;
  session.tenantId = snap.tenant.id;
  session.tenantSlug = snap.tenant.slug;
  session.tenantName = snap.tenant.name;
  session.role = roleOverride || session.role || "ADMIN";
  session.isLoggedIn = true;

  await session.save();
  return session;
}

/**
 * Mutates encrypted iron-session cookie inside a Next.js "use server" Server Action.
 */
export async function mutateServerActionSession(updates: {
  tenantSlug?: string;
  role?: UserRole;
}): Promise<SessionData> {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

  const nextSlug = resolveTenantSlug(updates.tenantSlug || session.tenantSlug || "apex-roofing");
  const snap = getTenantSnapshot(nextSlug);

  const roleUserMap: Record<UserRole, { id: string; name: string; email: string }> = {
    OWNER: { id: "u_1", name: "Marcus Vance", email: "marcus@integrityops.io" },
    ADMIN: { id: "u_1", name: "Marcus Vance", email: "marcus@integrityops.io" },
    REVIEWER: { id: "u_2", name: "Sarah Jenkins", email: "sarah@integrityops.io" },
    VIEWER: { id: "u_3", name: "Alex Mercer (Auditor)", email: "alex@integrityops.io" },
  };

  const nextRole = updates.role || session.role || "ADMIN";
  const identity = roleUserMap[nextRole];

  session.userId = identity.id;
  session.userName = identity.name;
  session.userEmail = identity.email;
  session.tenantId = snap.tenant.id;
  session.tenantSlug = snap.tenant.slug;
  session.tenantName = snap.tenant.name;
  session.role = nextRole;
  session.isLoggedIn = true;

  await session.save();
  return session;
}
