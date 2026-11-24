import { SessionOptions } from "iron-session";

export interface SessionData {
  userId: string;
  userEmail: string;
  userName: string;
  tenantId: string;
  tenantName: string;
  role: "OWNER" | "ADMIN" | "REVIEWER" | "VIEWER";
  isLoggedIn: boolean;
}

export const defaultSession: SessionData = {
  userId: "",
  userEmail: "",
  userName: "",
  tenantId: "",
  tenantName: "",
  role: "VIEWER",
  isLoggedIn: false,
};

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || "complex_password_at_least_32_characters_long_for_security_123456",
  cookieName: "lead_integrity_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
  },
};
