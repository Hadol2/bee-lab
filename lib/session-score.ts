type SessionQuestion = {
  id: string;
  answer: number;
};

type SubjectQuestion = SessionQuestion & {
  subject: string;
};

export type SubjectScore = {
  subject: string;
  correct: number;
  total: number;
  evaluated: number;
  complete: boolean;
  score: number;
};

export type PassRisk = {
  average: number;
  anySubjectFail: boolean;
  risk: "합격권" | "과락 위험" | "평균 점수 보완 필요";
};

export function calculateSessionScore(
  questions: SessionQuestion[],
  answers: Record<string, number>,
  checkedIds: string[],
  submitted = false,
) {
  const checked = new Set(checkedIds);
  const answered = questions.filter((question) => answers[question.id] !== undefined).length;
  const evaluated = submitted
    ? questions
    : questions.filter((question) => checked.has(question.id));
  const correct = evaluated.filter(
    (question) => answers[question.id] === question.answer,
  ).length;
  const complete = questions.length > 0 && evaluated.length === questions.length;

  return {
    answered,
    evaluated: evaluated.length,
    correct,
    incorrect: evaluated.length - correct,
    accuracy: questions.length ? Math.round((correct / questions.length) * 100) : 0,
    complete,
  };
}

export function calculateSubjectScores(
  questions: SubjectQuestion[],
  answers: Record<string, number>,
  checkedIds: string[],
  submitted = false,
): SubjectScore[] {
  const checked = new Set(checkedIds);
  const bySubject = new Map<string, { correct: number; total: number; evaluated: number }>();

  for (const question of questions) {
    const entry = bySubject.get(question.subject) ?? { correct: 0, total: 0, evaluated: 0 };
    entry.total += 1;
    if (submitted || checked.has(question.id)) {
      entry.evaluated += 1;
      if (answers[question.id] === question.answer) entry.correct += 1;
    }
    bySubject.set(question.subject, entry);
  }

  return [...bySubject.entries()].map(([subject, entry]) => ({
    subject,
    correct: entry.correct,
    total: entry.total,
    evaluated: entry.evaluated,
    complete: entry.total > 0 && entry.evaluated === entry.total,
    score: entry.total ? Math.round((entry.correct / entry.total) * 100) : 0,
  }));
}

export function calculatePassRisk(subjectScores: Array<{ score: number }>): PassRisk {
  if (!subjectScores.length) {
    return { average: 0, anySubjectFail: false, risk: "평균 점수 보완 필요" };
  }
  const average = Math.round(
    subjectScores.reduce((sum, subject) => sum + subject.score, 0) / subjectScores.length,
  );
  const anySubjectFail = subjectScores.some((subject) => subject.score < 40);
  const risk = anySubjectFail ? "과락 위험" : average >= 60 ? "합격권" : "평균 점수 보완 필요";
  return { average, anySubjectFail, risk };
}

export function hasCompleteSubjectCoverage(
  subjectScores: Array<{ subject: string }>,
  expectedSubjects: readonly string[],
) {
  if (!expectedSubjects.length) return false;
  const actualSubjects = new Set(subjectScores.map((subject) => subject.subject));
  return (
    actualSubjects.size === expectedSubjects.length &&
    expectedSubjects.every((subject) => actualSubjects.has(subject))
  );
}
