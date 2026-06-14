import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  createDriveFolder,
  findChildByName,
  uploadDataUrlFile,
} from "@/lib/drive";
import type { DriveRef } from "@/lib/types";

export const runtime = "nodejs";

const folderMimeType = "application/vnd.google-apps.folder";

async function getAccessToken() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    throw new Error("Google Drive 연결이 필요합니다.");
  }
  return session.accessToken;
}

async function ensureFolder(accessToken: string, parentId: string, name: string) {
  const existing = await findChildByName(accessToken, parentId, name, folderMimeType);
  if (existing) return existing;
  return createDriveFolder(accessToken, name, parentId);
}

export async function POST(req: Request) {
  try {
    const accessToken = await getAccessToken();
    const body = (await req.json()) as {
      assessmentFolderId?: string;
      kind?: "source" | "example";
      exampleId?: string;
      files?: Array<{ name: string; dataUrl: string }>;
    };

    if (!body.assessmentFolderId || !body.kind || !body.files?.length) {
      return NextResponse.json(
        { error: "assessmentFolderId, kind, files가 필요합니다." },
        { status: 400 },
      );
    }

    const parent =
      body.kind === "source"
        ? await ensureFolder(accessToken, body.assessmentFolderId, "source-materials")
        : await ensureFolder(accessToken, body.assessmentFolderId, "example-attachments");
    const uploadFolder =
      body.kind === "example"
        ? await ensureFolder(accessToken, parent.id, body.exampleId || "example")
        : parent;

    const refs: DriveRef[] = [];
    for (const file of body.files) {
      const uploaded = await uploadDataUrlFile(
        accessToken,
        file.name,
        file.dataUrl,
        uploadFolder.id,
      );
      refs.push({
        fileId: uploaded.id,
        name: uploaded.name,
        mimeType: uploaded.mimeType,
      });
    }

    return NextResponse.json({ files: refs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "평가 첨부 파일 저장 실패";
    const status = message.includes("Google Drive 연결") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
