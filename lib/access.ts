import type { NextRequest } from "next/server";

export const accessCookieName = "drive_essay_access";

function getPassword() {
  return process.env.APP_ACCESS_PASSWORD?.trim() ?? "";
}

function getSecretSalt() {
  return process.env.NEXTAUTH_SECRET?.trim() || "drive-essay-scoring";
}

async function sha256(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function isAccessPasswordEnabled() {
  return getPassword().length > 0;
}

export async function createAccessToken() {
  const password = getPassword();
  if (!password) return "";
  return sha256(`${getSecretSalt()}:${password}`);
}

export async function isAccessPasswordValid(password: string) {
  const configured = getPassword();
  return configured.length > 0 && password === configured;
}

export async function hasValidAccessCookie(req: NextRequest) {
  if (!isAccessPasswordEnabled()) return true;
  const cookieValue = req.cookies.get(accessCookieName)?.value;
  if (!cookieValue) return false;
  return cookieValue === (await createAccessToken());
}
