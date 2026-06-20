import "server-only";
import type {
  AppIndex,
  Assessment,
  AssessmentIndexItem,
  ClassIndex,
  GradingRecord,
  Rubric,
  ScoringExample,
  Subject,
  SubjectIndexItem,
} from "./types";

const driveBaseUrl = "https://www.googleapis.com/drive/v3";
const uploadBaseUrl = "https://www.googleapis.com/upload/drive/v3";
const folderMimeType = "application/vnd.google-apps.folder";
const appRootName = "서논술형 채점 앱";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

export interface AppRoot {
  root: DriveFile;
  indexFile: DriveFile;
  index: AppIndex;
}

async function driveFetch<T>(
  accessToken: string,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  const res = await fetch(url, {
    ...init,
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Drive 요청 실패 (${res.status}): ${text}`);
  }

  return res.json() as Promise<T>;
}

export async function createDriveFolder(
  accessToken: string,
  name: string,
  parentId?: string,
): Promise<DriveFile> {
  const body: Record<string, unknown> = {
    name,
    mimeType: folderMimeType,
  };
  if (parentId) body.parents = [parentId];

  return driveFetch<DriveFile>(
    accessToken,
    `${driveBaseUrl}/files?fields=id,name,mimeType`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export async function findChildByName(
  accessToken: string,
  parentId: string | undefined,
  name: string,
  mimeType?: string,
): Promise<DriveFile | null> {
  const clauses = [
    `name = '${escapeDriveQueryValue(name)}'`,
    "trashed = false",
  ];
  if (parentId) clauses.push(`'${parentId}' in parents`);
  if (mimeType) clauses.push(`mimeType = '${mimeType}'`);
  const query = encodeURIComponent(clauses.join(" and "));

  const result = await driveFetch<{ files: DriveFile[] }>(
    accessToken,
    `${driveBaseUrl}/files?q=${query}&fields=files(id,name,mimeType)&pageSize=1`,
  );

  return result.files[0] ?? null;
}

export async function listChildren(
  accessToken: string,
  parentId: string,
  mimeType?: string,
): Promise<DriveFile[]> {
  const clauses = [`'${parentId}' in parents`, "trashed = false"];
  if (mimeType) clauses.push(`mimeType = '${mimeType}'`);
  const query = encodeURIComponent(clauses.join(" and "));
  const result = await driveFetch<{ files: DriveFile[] }>(
    accessToken,
    `${driveBaseUrl}/files?q=${query}&fields=files(id,name,mimeType)&pageSize=1000&orderBy=name_natural`,
  );
  return result.files;
}

export async function downloadFile(
  accessToken: string,
  fileId: string,
): Promise<{ bytes: Buffer; mimeType: string; name: string }> {
  const meta = await driveFetch<DriveFile>(
    accessToken,
    `${driveBaseUrl}/files/${fileId}?fields=id,name,mimeType`,
  );
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${accessToken}`);
  const res = await fetch(`${driveBaseUrl}/files/${fileId}?alt=media`, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Drive 파일 다운로드 실패 (${res.status}): ${text}`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  return { bytes, mimeType: meta.mimeType, name: meta.name };
}

export async function trashDriveFile(
  accessToken: string,
  fileId: string,
): Promise<DriveFile> {
  return driveFetch<DriveFile>(
    accessToken,
    `${driveBaseUrl}/files/${fileId}?fields=id,name,mimeType`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    },
  );
}

/**
 * 폴더(와 그 하위 전부)를 휴지통으로 보낸다. drive.file 스코프에서는 내용이 있는 폴더를 통째로
 * 휴지통에 보내면 자식 권한 검사로 실패(appNotAuthorizedToChild)하므로, 하위부터 하나씩(앱이 만든
 * 파일은 개별 휴지통 가능) 비운 뒤 폴더를 보낸다.
 */
async function trashFolderTreeInDrive(accessToken: string, folderId: string): Promise<void> {
  const children = await listChildren(accessToken, folderId);
  for (const child of children) {
    if (child.mimeType === folderMimeType) {
      await trashFolderTreeInDrive(accessToken, child.id);
    } else {
      await trashDriveFile(accessToken, child.id);
    }
  }
  try {
    await trashDriveFile(accessToken, folderId);
  } catch {
    // 자식을 모두 비웠으면 폴더 자체 휴지통은 best-effort(실패해도 빈 폴더가 남는 정도라 무해).
  }
}

export async function uploadJsonFile(
  accessToken: string,
  name: string,
  data: unknown,
  parentId: string,
): Promise<DriveFile> {
  const boundary = `boundary-${crypto.randomUUID()}`;
  const metadata = {
    name,
    parents: [parentId],
    mimeType: "application/json",
  };
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(data, null, 2),
    `--${boundary}--`,
    "",
  ].join("\r\n");

  return driveFetch<DriveFile>(
    accessToken,
    `${uploadBaseUrl}/files?uploadType=multipart&fields=id,name,mimeType`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
}

export async function updateJsonFile(
  accessToken: string,
  fileId: string,
  data: unknown,
): Promise<DriveFile> {
  return driveFetch<DriveFile>(
    accessToken,
    `${uploadBaseUrl}/files/${fileId}?uploadType=media&fields=id,name,mimeType`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(data, null, 2),
    },
  );
}

export async function readJsonFile<T>(
  accessToken: string,
  fileId: string,
): Promise<T> {
  return driveFetch<T>(accessToken, `${driveBaseUrl}/files/${fileId}?alt=media`);
}

export async function readJsonChild<T>(
  accessToken: string,
  parentId: string,
  name: string,
): Promise<{ file: DriveFile; data: T } | null> {
  const file = await findChildByName(accessToken, parentId, name, "application/json");
  if (!file) return null;
  const data = await readJsonFile<T>(accessToken, file.id);
  return { file, data };
}

export async function writeJsonChild(
  accessToken: string,
  parentId: string,
  name: string,
  data: unknown,
): Promise<DriveFile> {
  const existing = await findChildByName(accessToken, parentId, name, "application/json");
  if (existing) return updateJsonFile(accessToken, existing.id, data);
  return uploadJsonFile(accessToken, name, data, parentId);
}

export async function uploadDataUrlFile(
  accessToken: string,
  name: string,
  dataUrl: string,
  parentId: string,
): Promise<DriveFile> {
  const commaIndex = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, commaIndex);
  const base64 = dataUrl.slice(commaIndex + 1);
  const mimeType = header.startsWith("data:")
    ? header.slice("data:".length).replace(";base64", "")
    : "";
  if (commaIndex < 0 || !mimeType || !base64) {
    throw new Error("data URL 형식이 올바르지 않습니다.");
  }
  const bytes = Buffer.from(base64, "base64");
  const boundary = `boundary-${crypto.randomUUID()}`;
  const metadata = { name, parents: [parentId], mimeType };
  const body = Buffer.concat([
    Buffer.from(
      [
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        JSON.stringify(metadata),
        `--${boundary}`,
        `Content-Type: ${mimeType}`,
        "",
        "",
      ].join("\r\n"),
      "utf8",
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
  ]);

  return driveFetch<DriveFile>(
    accessToken,
    `${uploadBaseUrl}/files?uploadType=multipart&fields=id,name,mimeType`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
}

export async function ensureAppRoot(accessToken: string): Promise<AppRoot> {
  let root = await findChildByName(accessToken, undefined, appRootName, folderMimeType);
  if (!root) {
    root = await createDriveFolder(accessToken, appRootName);
  }

  let indexFile = await findChildByName(accessToken, root.id, "app-index.json", "application/json");
  if (!indexFile) {
    indexFile = await uploadJsonFile(
      accessToken,
      "app-index.json",
      {
        version: 1,
        rootFolderId: root.id,
        subjects: [],
      },
      root.id,
    );
  }

  let index: AppIndex;
  try {
    index = await readJsonFile<AppIndex>(accessToken, indexFile.id);
  } catch {
    index = { version: 1, rootFolderId: root.id, subjects: [] };
    await updateJsonFile(accessToken, indexFile.id, index);
  }

  return { root, indexFile, index };
}

export async function createAppRoot(accessToken: string) {
  const root = await createDriveFolder(accessToken, appRootName);
  const index = await uploadJsonFile(
    accessToken,
    "app-index.json",
    {
      version: 1,
      rootFolderId: root.id,
      subjects: [],
    },
    root.id,
  );

  return { root, index };
}

export async function createSubjectInDrive(
  accessToken: string,
  name: string,
): Promise<{ subject: Subject; appRoot: AppRoot }> {
  const appRoot = await ensureAppRoot(accessToken);
  const subject: Subject = {
    id: crypto.randomUUID(),
    name,
    folderId: "",
    createdAt: Date.now(),
    assessments: [],
  };

  const folder = await createDriveFolder(accessToken, name, appRoot.root.id);
  subject.folderId = folder.id;
  await uploadJsonFile(accessToken, "subject.json", subject, folder.id);

  const subjectIndexItem: SubjectIndexItem = {
    id: subject.id,
    name: subject.name,
    folderId: subject.folderId,
    createdAt: subject.createdAt,
  };
  const nextIndex: AppIndex = {
    ...appRoot.index,
    subjects: [subjectIndexItem, ...appRoot.index.subjects],
  };
  await updateJsonFile(accessToken, appRoot.indexFile.id, nextIndex);

  return {
    subject,
    appRoot: { ...appRoot, index: nextIndex },
  };
}

export async function saveAssessmentInDrive(
  accessToken: string,
  input: {
    subject: SubjectIndexItem;
    assessment: Omit<Assessment, "folderId" | "createdAt"> & {
      createdAt?: number;
    };
    rubric: Rubric;
    examples: ScoringExample[];
  },
): Promise<{ assessment: Assessment; folder: DriveFile }> {
  const folder = await createDriveFolder(
    accessToken,
    input.assessment.title,
    input.subject.folderId,
  );

  const assessment: Assessment = {
    ...input.assessment,
    folderId: folder.id,
    createdAt: input.assessment.createdAt ?? Date.now(),
  };

  await uploadJsonFile(accessToken, "assessment.json", assessment, folder.id);
  await uploadJsonFile(accessToken, "rubric.json", input.rubric, folder.id);
  await uploadJsonFile(accessToken, "examples.json", input.examples, folder.id);

  const subjectJson = await readJsonChild<Subject>(
    accessToken,
    input.subject.folderId,
    "subject.json",
  );
  if (subjectJson) {
    const assessmentIndexItem: AssessmentIndexItem = {
      id: assessment.id,
      title: assessment.title,
      folderId: assessment.folderId,
      date: assessment.date,
      createdAt: assessment.createdAt,
    };
    const nextSubject: Subject = {
      ...subjectJson.data,
      assessments: [
        assessmentIndexItem,
        ...(subjectJson.data.assessments ?? []).filter(
          (item) => item.id !== assessment.id,
        ),
      ],
    };
    await updateJsonFile(accessToken, subjectJson.file.id, nextSubject);
  }

  return { assessment, folder };
}

export async function listAssessmentsInDrive(
  accessToken: string,
  subjectId: string,
): Promise<AssessmentIndexItem[]> {
  const appRoot = await ensureAppRoot(accessToken);
  const subjectIndex = appRoot.index.subjects.find((item) => item.id === subjectId);
  if (!subjectIndex) return [];

  const subjectJson = await readJsonChild<Subject>(
    accessToken,
    subjectIndex.folderId,
    "subject.json",
  );
  return subjectJson?.data.assessments ?? [];
}

/** 과목 삭제 — 과목 폴더(그 안의 회차·반·학생·채점 전부)를 휴지통으로 보내고 app-index에서 제거 */
export async function deleteSubjectInDrive(
  accessToken: string,
  subjectId: string,
): Promise<void> {
  const appRoot = await ensureAppRoot(accessToken);
  const subject = appRoot.index.subjects.find((item) => item.id === subjectId);
  if (subject?.folderId) {
    await trashFolderTreeInDrive(accessToken, subject.folderId);
  }
  const nextIndex: AppIndex = {
    ...appRoot.index,
    subjects: appRoot.index.subjects.filter((item) => item.id !== subjectId),
  };
  await updateJsonFile(accessToken, appRoot.indexFile.id, nextIndex);
}

/** 회차 삭제 — 회차 폴더(그 안의 반·학생·채점 전부)를 휴지통으로 보내고 subject.json에서 제거 */
export async function deleteAssessmentInDrive(
  accessToken: string,
  subjectId: string,
  assessmentId: string,
): Promise<void> {
  const appRoot = await ensureAppRoot(accessToken);
  const subjectIndex = appRoot.index.subjects.find((item) => item.id === subjectId);
  if (!subjectIndex) return;
  const subjectJson = await readJsonChild<Subject>(
    accessToken,
    subjectIndex.folderId,
    "subject.json",
  );
  if (!subjectJson) return;
  const assessment = (subjectJson.data.assessments ?? []).find(
    (item) => item.id === assessmentId,
  );
  if (assessment?.folderId) {
    await trashFolderTreeInDrive(accessToken, assessment.folderId);
  }
  const nextSubject: Subject = {
    ...subjectJson.data,
    assessments: (subjectJson.data.assessments ?? []).filter(
      (item) => item.id !== assessmentId,
    ),
  };
  await updateJsonFile(accessToken, subjectJson.file.id, nextSubject);
}

export async function readAssessmentBundle(
  accessToken: string,
  assessmentFolderId: string,
): Promise<{
  assessment: Assessment | null;
  rubric: Rubric;
  examples: ScoringExample[];
}> {
  const [assessmentJson, rubricJson, examplesJson] = await Promise.all([
    readJsonChild<Assessment>(accessToken, assessmentFolderId, "assessment.json"),
    readJsonChild<Rubric>(accessToken, assessmentFolderId, "rubric.json"),
    readJsonChild<ScoringExample[]>(accessToken, assessmentFolderId, "examples.json"),
  ]);

  return {
    assessment: assessmentJson?.data ?? null,
    rubric: rubricJson?.data ?? { criteria: [] },
    examples: examplesJson?.data ?? [],
  };
}

export async function updateAssessmentBundle(
  accessToken: string,
  assessmentFolderId: string,
  input: {
    assessment: Assessment;
    rubric: Rubric;
    examples: ScoringExample[];
  },
): Promise<void> {
  await Promise.all([
    writeJsonChild(accessToken, assessmentFolderId, "assessment.json", input.assessment),
    writeJsonChild(accessToken, assessmentFolderId, "rubric.json", input.rubric),
    writeJsonChild(accessToken, assessmentFolderId, "examples.json", input.examples),
  ]);

  const appRoot = await ensureAppRoot(accessToken);
  const subjectIndex = appRoot.index.subjects.find(
    (item) => item.id === input.assessment.subjectId,
  );
  if (!subjectIndex) return;

  const subjectJson = await readJsonChild<Subject>(
    accessToken,
    subjectIndex.folderId,
    "subject.json",
  );
  if (!subjectJson) return;

  const nextSubject: Subject = {
    ...subjectJson.data,
    assessments: (subjectJson.data.assessments ?? []).map((item) =>
      item.id === input.assessment.id
        ? {
            id: input.assessment.id,
            title: input.assessment.title,
            folderId: input.assessment.folderId,
            date: input.assessment.date,
            createdAt: input.assessment.createdAt,
          }
        : item,
    ),
  };
  await updateJsonFile(accessToken, subjectJson.file.id, nextSubject);
}

export async function listClassIndexesInDrive(
  accessToken: string,
  assessmentFolderId: string,
): Promise<ClassIndex[]> {
  const classFolders = await listChildren(accessToken, assessmentFolderId, folderMimeType);
  const indexes: ClassIndex[] = [];
  for (const folder of classFolders) {
    const classJson = await readJsonChild<ClassIndex>(
      accessToken,
      folder.id,
      "class-index.json",
    );
    if (classJson) {
      indexes.push({
        ...classJson.data,
        folderId: folder.id,
        name: folder.name,
      });
    }
  }
  return indexes;
}

export async function readStudentGradingSummary(
  accessToken: string,
  studentFolderId: string,
): Promise<{
  aiGrading: GradingRecord["aiGrading"] | null;
  finalGrading: GradingRecord["finalGrading"] | null;
}> {
  const [ai, final] = await Promise.all([
    readJsonChild<GradingRecord["aiGrading"]>(
      accessToken,
      studentFolderId,
      "ai-grading.json",
    ),
    readJsonChild<GradingRecord["finalGrading"]>(
      accessToken,
      studentFolderId,
      "final-grading.json",
    ),
  ]);
  return {
    aiGrading: ai?.data ?? null,
    finalGrading: final?.data ?? null,
  };
}
