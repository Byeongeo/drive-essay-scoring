"use client";

import type { Assessment, ClassIndex, Rubric, ScoringExample } from "./types";

const key = "drive-essay-scoring-store-v1";

export interface DraftSubject {
  id: string;
  name: string;
  createdAt: number;
  folderId?: string;
}

export interface DraftAssessment
  extends Omit<Assessment, "folderId" | "subjectId" | "createdAt"> {
  subjectId: string;
  createdAt: number;
  folderId?: string;
}

export interface DraftStore {
  subjects: DraftSubject[];
  assessments: DraftAssessment[];
  rubrics: Record<string, Rubric>;
  examples: Record<string, ScoringExample[]>;
  classIndexes: Record<string, ClassIndex[]>;
}

const emptyStore: DraftStore = {
  subjects: [],
  assessments: [],
  rubrics: {},
  examples: {},
  classIndexes: {},
};

export function loadStore(): DraftStore {
  if (typeof window === "undefined") return emptyStore;
  const raw = window.localStorage.getItem(key);
  if (!raw) return emptyStore;
  try {
    return { ...emptyStore, ...(JSON.parse(raw) as DraftStore) };
  } catch {
    return emptyStore;
  }
}

export function saveStore(store: DraftStore): void {
  window.localStorage.setItem(key, JSON.stringify(store));
}

export function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
