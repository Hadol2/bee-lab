export const OFFICIAL_SUBJECTS = [
  "폐기물 개론",
  "폐기물 처리 기술",
  "폐기물 소각 및 열회수",
  "폐기물 공정시험기준",
  "폐기물 관계 법규",
] as const;

export type OfficialSubject = (typeof OFFICIAL_SUBJECTS)[number];

type SubjectQuestion = {
  id: string;
  subject: string;
};

export function shuffled<T>(items: readonly T[], random = Math.random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function createSubjectSet<T extends SubjectQuestion>(
  questions: readonly T[],
  subject: OfficialSubject,
  count = 20,
  random = Math.random,
): T[] {
  const candidates = questions.filter((question) => question.subject === subject);
  if (candidates.length < count) {
    throw new Error(`${subject} 문제 수가 ${count}개보다 적습니다.`);
  }
  return shuffled(candidates, random).slice(0, count);
}

export function createMockExam<T extends SubjectQuestion>(
  questions: readonly T[],
  random = Math.random,
): T[] {
  return OFFICIAL_SUBJECTS.flatMap((subject) =>
    createSubjectSet(questions, subject, 20, random),
  );
}

export const CURRENT_SUBJECT_KEYS = ["subject-1", "subject-2", "subject-3", "subject-4"] as const;

export type CurrentSubjectKey = (typeof CURRENT_SUBJECT_KEYS)[number];

export type DomainMappingRecord = {
  questionId: string;
  currentSubjectKey: CurrentSubjectKey | null;
  eligibleForCurrentMock: boolean;
};

export type DomainMapping = {
  version: 2;
  records: readonly DomainMappingRecord[];
};

function candidateIdsForCurrentSubject(mapping: DomainMapping, key: CurrentSubjectKey): Set<string> {
  const ids = new Set<string>();
  for (const record of mapping.records) {
    if (record.eligibleForCurrentMock && record.currentSubjectKey === key) {
      ids.add(record.questionId);
    }
  }
  return ids;
}

export function createCurrentSubjectSet<T extends SubjectQuestion>(
  questions: readonly T[],
  mapping: DomainMapping,
  key: CurrentSubjectKey,
  count = 20,
  random = Math.random,
): T[] {
  const candidateIds = candidateIdsForCurrentSubject(mapping, key);
  const candidates = questions.filter((question) => candidateIds.has(question.id));
  if (candidates.length < count) {
    throw new Error(
      `${key} 문제 수가 ${count}개보다 적습니다 (매핑된 후보: ${candidates.length}개). 공식 출제기준 파일 확보 전에는 발생할 수 있는 정상적인 실패입니다.`,
    );
  }
  return shuffled(candidates, random).slice(0, count);
}

export function createCurrentMockExam<T extends SubjectQuestion>(
  questions: readonly T[],
  mapping: DomainMapping,
  random = Math.random,
): T[] {
  return CURRENT_SUBJECT_KEYS.flatMap((key) =>
    createCurrentSubjectSet(questions, mapping, key, 20, random),
  );
}
