import type { HeaderExtraction } from "./types";

export interface PageClassification {
  pageIndex: number;
  pageNumber: number;
  header: HeaderExtraction;
}

export interface StudentPageGroup {
  startPageIndex: number;
  pageIndexes: number[];
  header: HeaderExtraction;
}

export function deriveStudentGroups(
  pages: PageClassification[],
): StudentPageGroup[] {
  const groups: StudentPageGroup[] = [];

  pages.forEach((page, index) => {
    const isStart = index === 0 || page.header.hasHeader;
    if (isStart || groups.length === 0) {
      groups.push({
        startPageIndex: page.pageIndex,
        pageIndexes: [page.pageIndex],
        header: page.header,
      });
      return;
    }

    groups[groups.length - 1].pageIndexes.push(page.pageIndex);
  });

  return groups;
}

export function formatStudentFolderName(header: HeaderExtraction): string {
  const grade = header.grade ?? 0;
  const classNo = header.classNo ?? 0;
  const studentNo = String(header.studentNo ?? 0).padStart(2, "0");
  const name = (header.name || "이름없음").replace(/[\\/:*?"<>|]/g, "_");
  return `${grade}학년_${classNo}반_${studentNo}번_${name}`;
}
