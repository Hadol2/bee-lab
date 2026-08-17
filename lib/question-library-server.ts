import { readFile } from "node:fs/promises";
import path from "node:path";
import manifest from "../public/data/exams/manifest.json" with { type: "json" };

type StoredQuestion = {
  id: string;
  number: number;
  subject: string;
  labels: string[];
  text: string;
  choices: string[];
  answer: number;
  sourcePage: number;
  visuals: string[];
};

type StoredExam = {
  date: string;
  label: string;
  questions: StoredQuestion[];
};

export type ExplanationQuestion = StoredQuestion & {
  examLabel: string;
  imageFiles: Array<{ name: string; data: Uint8Array }>;
};

const QUESTION_ID = /^(\d{8})-(\d{3})$/;
const knownDates = new Set(manifest.map((exam) => exam.date));
const examCache = new Map<string, Promise<StoredExam>>();

function loadExam(date: string) {
  let pending = examCache.get(date);
  if (!pending) {
    const examPath = path.join(process.cwd(), "public", "data", "exams", `${date}.json`);
    pending = readFile(examPath, "utf8").then((contents) => JSON.parse(contents) as StoredExam);
    examCache.set(date, pending);
  }
  return pending;
}

export async function listExplanationQuestionIds() {
  const exams = await Promise.all(manifest.map((item) => loadExam(item.date)));
  return exams.flatMap((exam) => exam.questions.map((question) => question.id));
}

export async function loadExplanationQuestion(
  questionId: string,
): Promise<ExplanationQuestion | null> {
  const match = QUESTION_ID.exec(questionId);
  if (!match || !knownDates.has(match[1])) return null;

  const exam = await loadExam(match[1]);
  const question = exam.questions.find((item) => item.id === questionId);
  if (!question) return null;

  const imageFiles = await Promise.all(
    question.visuals.map(async (visual) => {
      const name = path.basename(visual);
      return {
        name,
        data: await readFile(path.join(process.cwd(), "public", "question-images", name)),
      };
    }),
  );

  return { ...question, examLabel: exam.label, imageFiles };
}
