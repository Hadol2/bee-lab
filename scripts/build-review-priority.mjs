import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const examsDir = path.join(__dirname, "..", "public", "data", "exams");
const outputPath = path.join(__dirname, "..", "public", "data", "review-priority.json");

const OFFICIAL_SUBJECTS = [
  "폐기물 개론",
  "폐기물 처리 기술",
  "폐기물 소각 및 열회수",
  "폐기물 공정시험기준",
  "폐기물 관계 법규",
];

const PER_SUBJECT = 60;

const LEGACY_FLAGGED_SUBJECTS = ["폐기물 공정시험기준", "폐기물 관계 법규"];

async function loadAllQuestions() {
  const manifest = JSON.parse(await readFile(path.join(examsDir, "manifest.json"), "utf8"));
  const questions = [];
  for (const entry of manifest) {
    const exam = JSON.parse(await readFile(path.join(examsDir, `${entry.date}.json`), "utf8"));
    for (const question of exam.questions) {
      questions.push(question);
    }
  }
  return questions;
}

function scoreQuestion(question) {
  const reasons = [];
  let score = 0;

  const visualCount = Array.isArray(question.visuals) ? question.visuals.length : 0;
  if (visualCount > 0) {
    score += 40;
    reasons.push("시각 자료(표·그림) 포함 — 자동 해설 검증이 어려움");
  }

  if (LEGACY_FLAGGED_SUBJECTS.includes(question.subject)) {
    score += 25;
    reasons.push("현행 고시 대비 미확인 과목");
  }

  const textLength = typeof question.text === "string" ? question.text.trim().length : 0;
  if (textLength < 20) {
    score += 15;
    reasons.push("문제 본문이 지나치게 짧음");
  } else if (textLength > 250) {
    score += 10;
    reasons.push("문제 본문이 지나치게 김");
  }

  const choices = Array.isArray(question.choices) ? question.choices : [];
  if (choices.length !== 4) {
    score += 20;
    reasons.push("선택지 개수가 4개가 아님");
  }

  const trimmedChoices = choices.map((choice) => (typeof choice === "string" ? choice.trim() : ""));
  if (trimmedChoices.some((choice) => choice.length < 2)) {
    score += 15;
    reasons.push("지나치게 짧은 선택지 존재");
  }

  const uniqueChoices = new Set(trimmedChoices);
  if (uniqueChoices.size < trimmedChoices.length) {
    score += 20;
    reasons.push("중복된 선택지 존재");
  }

  const numericChoiceCount = trimmedChoices.filter((choice) => /\d/.test(choice)).length;
  if (numericChoiceCount >= 3) {
    score += 10;
    reasons.push("계산·수치 기반 선택지 다수 — 계산 오류 위험");
  }

  const combinedText = [typeof question.text === "string" ? question.text : "", ...trimmedChoices].join(" ");
  const CALCULATION_SIGNAL_PATTERN =
    /\d\s*%|mg\s*\/\s*L|kg|ton|m\s*3|m³|kcal|kJ|mol|ppm|유량|농도|효율|함수율|발열량|계산|구하/;
  if (CALCULATION_SIGNAL_PATTERN.test(combinedText)) {
    score += 20;
    reasons.push("계산·단위·공식 관련 표현 포함 — 수치 계산 검증 필요");
  }

  return { score, reasons };
}

function selectTopPerSubject(questions) {
  const scored = questions.map((question) => {
    const { score, reasons } = scoreQuestion(question);
    return { question, score, reasons };
  });

  const bySubject = new Map();
  for (const subject of OFFICIAL_SUBJECTS) {
    bySubject.set(subject, []);
  }
  for (const entry of scored) {
    const bucket = bySubject.get(entry.question.subject);
    if (bucket) bucket.push(entry);
  }

  const selected = [];
  for (const subject of OFFICIAL_SUBJECTS) {
    const bucket = bySubject.get(subject) ?? [];
    bucket.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.question.id.localeCompare(b.question.id);
    });
    selected.push(...bucket.slice(0, PER_SUBJECT));
  }

  return selected;
}

function toExamDate(questionId) {
  const match = /^(\d{4})(\d{2})(\d{2})-/.exec(questionId);
  if (!match) return null;
  const [, year, month, day] = match;
  return `${year}-${month}-${day}`;
}

function buildItems(selected) {
  const ranked = [...selected].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.question.id.localeCompare(b.question.id);
  });

  return ranked.map((entry, index) => ({
    rank: index + 1,
    questionId: entry.question.id,
    legacySubject: entry.question.subject,
    examDate: toExamDate(entry.question.id),
    score: entry.score,
    reasons: entry.reasons,
    reviewStatus: "unreviewed",
  }));
}

export async function buildReviewPriority() {
  const questions = await loadAllQuestions();
  const selected = selectTopPerSubject(questions);
  const items = buildItems(selected);

  const output = {
    metadata: {
      version: 1,
      generatedAt: "2026-08-14",
      description:
        "이 순위는 문항 텍스트·선택지·시각 자료·시행 당시 과목 정보를 기준으로 기계적으로 계산된 검수 우선순위이며, 사람에 의한 실제 검수가 완료되었음을 의미하지 않습니다.",
      methodology:
        "이 순위는 규칙 기반 스코어링 스크립트가 산출한 기계적 우선순위이며, 사람에 의한 실제 검수(human review)를 대체하지 않습니다.",
      totalQuestions: questions.length,
      subjects: OFFICIAL_SUBJECTS,
      selectedPerSubject: PER_SUBJECT,
      totalSelected: items.length,
    },
    items,
  };

  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  await writeFile(outputPath, serialized, "utf8");
  return output;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const output = await buildReviewPriority();
  console.log(
    `Wrote ${output.items.length} review-priority records to ${path.relative(process.cwd(), outputPath)}`,
  );
}
