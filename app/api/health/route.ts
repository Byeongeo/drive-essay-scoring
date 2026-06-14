import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    gemini: Boolean(process.env.GEMINI_API_KEY),
    googleClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
    googleClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    nextAuthSecret: Boolean(process.env.NEXTAUTH_SECRET),
    nextAuthUrl: process.env.NEXTAUTH_URL || null,
  });
}
