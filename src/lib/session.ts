import { SessionOptions } from "iron-session";
import { UserRole } from "../contracts/lead-contracts";

export interface SessionData {
  userId: string;
  userEmail: string;
  userName: string;
  tenantId: string;
  tenantSlug: "apex-roofing" | "summit-solar" | "thames-heating";
  tenantName: string;
  role: UserRole;
  isLoggedIn: boolean;
}

export const defaultSession: SessionData = {
  userId: "u_1",
  userEmail: "marcus@integrityops.io",
  userName: "Marcus Vance",
  tenantId: "tenant_apex_us",
  tenantSlug: "apex-roofing",
  tenantName: "Apex Roofing TX",
  role: "ADMIN",
  isLoggedIn: true,
};

export const sessionOptions: SessionOptions = {
  password:
    process.env.SESSION_SECRET ||
    "complex_password_at_least_32_characters_long_for_security_123456",
  cookieName: "lead_integrity_session",
  cookieOptions: {
    path: "/",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
  },
};
