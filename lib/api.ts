"use client";

import type {
  Assessment,
  AssessmentIndexItem,
  ClassIndex,
  GradeInput,
  GradingRecord,
  GradingSnapshot,
  HeaderExtraction,
  OcrConfirmed,
  OcrDraft,
  Rubric,
  ScoringExample,
  SubjectIndexItem,
  GradingMode,
  DriveRef,
} from "./types";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `요청 실패 (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

async function delJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    let message = `요청 실패 (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

async function patchJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `요청 실패 (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

export function classifyPage(
  pageImageBase64: string,
  mimeType = "image/jpeg",
): Promise<HeaderExtraction> {
  return postJson<HeaderExtraction>("/api/classify", { pageImageBase64, mimeType });
}

export function extractRubric(systemPrompt: string): Promise<Rubric> {
  return postJson<Rubric>("/api/rubric/extract", { systemPrompt });
}

export function gradeAnswer(body: GradeInput): Promise<GradingSnapshot> {
  return postJson<GradingSnapshot>("/api/grade", body);
}

export function createDriveSubject(name: string): Promise<SubjectIndexItem> {
  return postJson<SubjectIndexItem>("/api/drive/subjects", { name });
}

export async function listDriveSubjects(): Promise<SubjectIndexItem[]> {
  const res = await fetch("/api/drive/subjects");
  if (!res.ok) {
    let message = `요청 실패 (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return res.json() as Promise<SubjectIndexItem[]>;
}

export async function listDriveAssessments(
  subjectId: string,
): Promise<AssessmentIndexItem[]> {
  const res = await fetch(`/api/drive/assessments?subjectId=${encodeURIComponent(subjectId)}`);
  if (!res.ok) {
    let message = `요청 실패 (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return res.json() as Promise<AssessmentIndexItem[]>;
}

export async function readDriveAssessmentBundle(folderId: string): Promise<{
  assessment: Assessment | null;
  rubric: Rubric;
  examples: ScoringExample[];
}> {
  const res = await fetch(`/api/drive/assessments?folderId=${encodeURIComponent(folderId)}`);
  if (!res.ok) {
    let message = `요청 실패 (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return res.json() as Promise<{
    assessment: Assessment | null;
    rubric: Rubric;
    examples: ScoringExample[];
  }>;
}

export function saveDriveAssessment(body: {
  subjectId: string;
  subjectName?: string;
  assessment: Omit<Assessment, "folderId" | "createdAt"> & { createdAt?: number };
  rubric: Rubric;
  examples: ScoringExample[];
}): Promise<Assessment> {
  return postJson<Assessment>("/api/drive/assessments", body);
}

export function updateDriveAssessment(body: {
  assessment: Assessment;
  rubric: Rubric;
  examples: ScoringExample[];
}): Promise<{ ok: boolean }> {
  return patchJson<{ ok: boolean }>("/api/drive/assessments", body);
}

export function deleteDriveSubject(subjectId: string): Promise<{ ok: boolean }> {
  return delJson<{ ok: boolean }>(
    `/api/drive/subjects?subjectId=${encodeURIComponent(subjectId)}`,
  );
}

export function deleteDriveAssessment(
  subjectId: string,
  assessmentId: string,
): Promise<{ ok: boolean }> {
  return delJson<{ ok: boolean }>(
    `/api/drive/assessments?subjectId=${encodeURIComponent(subjectId)}&assessmentId=${encodeURIComponent(assessmentId)}`,
  );
}

export function uploadAssessmentFiles(body: {
  assessmentFolderId: string;
  kind: "source" | "example";
  exampleId?: string;
  files: Array<{ name: string; dataUrl: string }>;
}): Promise<{ files: DriveRef[] }> {
  return postJson<{ files: DriveRef[] }>("/api/drive/assessment-files", body);
}

export function saveClassUploadToDrive(body: {
  subjectId: string;
  assessmentFolderId?: string;
  assessmentTitle: string;
  className: string;
  groups: Array<{
    header: HeaderExtraction;
    pages: Array<{ name: string; dataUrl: string }>;
  }>;
}): Promise<{ classIndex: ClassIndex }> {
  return postJson<{ classIndex: ClassIndex }>("/api/drive/class-upload", body);
}

export function createClassSession(body: {
  subjectId: string;
  assessmentFolderId?: string;
  assessmentTitle: string;
  className: string;
  grade?: number;
  classNo?: number;
}): Promise<{
  classFolder: { id: string; name: string; mimeType: string };
  studentsFolder: { id: string; name: string; mimeType: string };
  classIndex: ClassIndex;
}> {
  return postJson("/api/drive/class-session", body);
}

export function saveClassStudent(body: {
  classFolderId: string;
  studentsFolderId: string;
  header: HeaderExtraction;
  pages: Array<{ name: string; dataUrl: string }>;
}): Promise<{ student: ClassIndex["students"][number]; classIndex?: ClassIndex }> {
  return postJson("/api/drive/class-student", body);
}

export async function listDriveClasses(assessmentFolderId: string): Promise<ClassIndex[]> {
  const res = await fetch(
    `/api/drive/classes?assessmentFolderId=${encodeURIComponent(assessmentFolderId)}`,
  );
  if (!res.ok) {
    let message = `요청 실패 (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return res.json() as Promise<ClassIndex[]>;
}

export async function loadDriveReport(assessmentFolderId: string): Promise<ClassIndex[]> {
  const res = await fetch(
    `/api/drive/report?assessmentFolderId=${encodeURIComponent(assessmentFolderId)}`,
  );
  if (!res.ok) {
    let message = `요청 실패 (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return res.json() as Promise<ClassIndex[]>;
}

export function saveStudentWorkToDrive(body: {
  studentFolderId: string;
  ocrDraft?: OcrDraft;
  ocrConfirmed?: OcrConfirmed;
  aiGrading?: GradingSnapshot;
  finalGrading?: GradingRecord["finalGrading"];
}): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>("/api/drive/student-work", body);
}

export async function loadStudentWorkFromDrive(studentFolderId: string): Promise<{
  ocrDraft: OcrDraft | null;
  ocrConfirmed: OcrConfirmed | null;
  aiGrading: GradingSnapshot | null;
  finalGrading: GradingRecord["finalGrading"] | null;
}> {
  const res = await fetch(
    `/api/drive/student-work?studentFolderId=${encodeURIComponent(studentFolderId)}`,
  );
  if (!res.ok) {
    let message = `요청 실패 (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return res.json();
}

export async function deleteStudentWorkFromDrive(body: {
  assessmentFolderId: string;
  studentFolderId: string;
}): Promise<{ ok: boolean; classIndex?: ClassIndex | null }> {
  const res = await fetch("/api/drive/student-work", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `요청 실패 (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return res.json();
}

export function interpretStudentFromDrive(body: {
  studentFolderId: string;
  pageRefs: Array<{ fileId: string; name: string; mimeType?: string }>;
  crossCheck?: boolean;
}): Promise<OcrDraft> {
  return postJson<OcrDraft>("/api/drive/interpret-student", body);
}

export async function fileToBase64(fileId: string): Promise<{
  base64: string;
  mimeType: string;
  name: string;
}> {
  const res = await fetch(`/api/drive/file/${fileId}`);
  if (!res.ok) {
    throw new Error(`파일 불러오기 실패 (${res.status})`);
  }
  const blob = await res.blob();
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return {
    base64: btoa(binary),
    mimeType: blob.type || "image/jpeg",
    name: fileId,
  };
}

export function recommendGradingMode(visualKinds: string[]): GradingMode {
  const imageNeededKinds = new Set([
    "formula",
    "diagram",
    "graph",
    "drawing",
    "table",
    "chemical-formula",
  ]);
  return visualKinds.some((kind) => imageNeededKinds.has(kind))
    ? "image-assisted"
    : "text-only";
}
