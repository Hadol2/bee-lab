import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const examsDir = path.join(__dirname, "..", "public", "data", "exams");
const outputPath = path.join(__dirname, "..", "public", "data", "freshness.json");

const TEST_STANDARD_SUBJECT = "폐기물 공정시험기준";
const LAW_SUBJECT = "폐기물 관계 법규";
const TARGET_SUBJECTS = [TEST_STANDARD_SUBJECT, LAW_SUBJECT];

const CURRENT_STANDARD = {
  name: "폐기물공정시험기준",
  ref: "국립환경과학원고시 제2025-21호",
  effective: "2025-08-06",
  url: "https://www.law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=2100000263068",
};

function examDateFromQuestionId(questionId) {
  const [examDate] = questionId.split("-");
  return examDate;
}

function noteForTestStandard() {
  return "이 문항은 시행 당시 기준으로 출제되었으며, 현행 고시와의 개별 비교·검증은 이루어지지 않았습니다.";
}

function noteForLaw() {
  return "이 문항은 시행 당시 관계 법규를 기준으로 출제되었으며, 개별 조항의 현행 여부에 대한 검증은 이루어지지 않았습니다.";
}

async function loadManifestDates() {
  const manifestRaw = await readFile(path.join(examsDir, "manifest.json"), "utf8");
  const manifest = JSON.parse(manifestRaw);
  return manifest.map((entry) => entry.date).sort();
}

async function buildFreshnessRecords() {
  const dates = await loadManifestDates();
  const records = [];

  for (const date of dates) {
    const examRaw = await readFile(path.join(examsDir, `${date}.json`), "utf8");
    const exam = JSON.parse(examRaw);

    for (const question of exam.questions) {
      if (!TARGET_SUBJECTS.includes(question.subject)) continue;

      const isTestStandard = question.subject === TEST_STANDARD_SUBJECT;
      records.push({
        questionId: question.id,
        examDate: examDateFromQuestionId(question.id),
        legacySubject: question.subject,
        currentStandard: isTestStandard ? CURRENT_STANDARD : null,
        status: "unverified",
        delta: null,
        verifiedBy: null,
        note: isTestStandard ? noteForTestStandard() : noteForLaw(),
      });
    }
  }

  records.sort((a, b) => a.questionId.localeCompare(b.questionId));
  return records;
}

async function main() {
  const records = await buildFreshnessRecords();
  const seen = new Set();
  for (const record of records) {
    if (seen.has(record.questionId)) {
      throw new Error(`duplicate questionId in freshness records: ${record.questionId}`);
    }
    seen.add(record.questionId);
  }

  await writeFile(outputPath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  console.log(`Wrote ${records.length} freshness records to ${path.relative(process.cwd(), outputPath)}`);
}

await main();
