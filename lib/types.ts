export type Millis = number;

export type RubricSource = "structured" | "extracted-from-prompt";

export type StudentWorkStatus =
  | "uploaded"
  | "classified"
  | "ocr-draft"
  | "ocr-confirmed"
  | "ai-graded"
  | "final-saved";

export type GradingMode = "text-only" | "image-assisted" | "auto";

export interface DriveRef {
  fileId: string;
  name: string;
  mimeType?: string;
}

export interface AppIndex {
  version: 1;
  rootFolderId: string;
  subjects: SubjectIndexItem[];
}

export interface SubjectIndexItem {
  id: string;
  name: string;
  folderId: string;
  createdAt: Millis;
}

export interface AssessmentIndexItem {
  id: string;
  title: string;
  folderId: string;
  date: Millis;
  createdAt: Millis;
}

export interface Subject {
  id: string;
  name: string;
  folderId: string;
  createdAt: Millis;
  assessments: AssessmentIndexItem[];
}

export interface Assessment {
  id: string;
  subjectId: string;
  title: string;
  date: Millis;
  folderId: string;
  systemPrompt: string;
  rubricSource: RubricSource;
  gradingModel: string;
  gradingMode?: GradingMode;
  sourceMaterials?: DriveRef[];
  createdAt: Millis;
}

export interface RubricLevel {
  label: string;
  score: number;
  descriptor: string;
}

export interface RubricCriterion {
  name: string;
  levels: RubricLevel[];
}

export interface Rubric {
  criteria: RubricCriterion[];
}

export interface ScoringExample {
  id: string;
  score: number;
  text: string;
  reason: string;
  attachments: DriveRef[];
}

export interface ClassIndex {
  folderId?: string;
  name?: string;
  grade: number;
  classNo: number;
  originalUpload?: DriveRef;
  students: StudentIndexItem[];
  updatedAt: Millis;
}

export interface StudentIndexItem {
  id: string;
  grade: number;
  classNo: number;
  studentNo: number;
  name: string;
  folderId: string;
  pageRefs?: DriveRef[];
  status: StudentWorkStatus;
  totalScore?: number;
  updatedAt: Millis;
}

export interface HeaderExtraction {
  hasHeader: boolean;
  grade?: number;
  classNo?: number;
  studentNo?: number;
  name?: string;
  confidence?: number;
}

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MaskedToken {
  index: number;
  pageRef: DriveRef;
  bbox: BBox;
  note?: string;
}

export interface VisualElement {
  kind: "formula" | "diagram" | "graph" | "drawing" | "table" | "chemical-formula" | "other";
  description: string;
  pageRef?: DriveRef;
  bbox?: BBox;
}

export interface OcrDraft {
  text: string;
  maskedTokens: MaskedToken[];
  visualElements: VisualElement[];
}

export interface OcrConfirmed extends OcrDraft {
  confirmedByTeacher: true;
  confirmedAt: Millis;
}

export interface CriterionScore {
  criterionName: string;
  score: number;
  reason: string;
}

export interface GradingSnapshot {
  gradingMode?: GradingMode;
  scores: CriterionScore[];
  totalScore: number;
  overallReason: string;
  feedback: string;
}

export interface GradingRecord {
  aiGrading: GradingSnapshot;
  finalGrading?: GradingSnapshot & {
    confirmedByTeacher: true;
    confirmedAt: Millis;
  };
}

export interface GradeInput {
  rubric: Rubric;
  examples: ScoringExample[];
  systemPrompt: string;
  sourceMaterials?: Array<{ base64: string; mimeType: string; name: string }>;
  exampleMaterials?: Array<{
    exampleId: string;
    base64: string;
    mimeType: string;
    name: string;
  }>;
  confirmedAnswerText: string;
  visualElements: VisualElement[];
  answerImages: Array<{ base64: string; mimeType: string; name: string }>;
  gradingMode?: GradingMode;
  model?: string;
}
