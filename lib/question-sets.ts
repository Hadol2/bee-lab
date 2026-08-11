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
