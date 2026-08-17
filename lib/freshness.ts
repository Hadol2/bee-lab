export type FreshnessStatus = "unverified";

export type CurrentStandard = {
  name: string;
  ref: string;
  effective: string;
  url: string;
};

export type FreshnessRecord = {
  questionId: string;
  examDate: string;
  legacySubject: string;
  currentStandard: CurrentStandard | null;
  status: FreshnessStatus;
  delta: null;
  verifiedBy: null;
  note: string;
};

function isCurrentStandard(value: unknown): value is CurrentStandard {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === "string" &&
    typeof candidate.ref === "string" &&
    typeof candidate.effective === "string" &&
    typeof candidate.url === "string"
  );
}

export function isFreshnessRecord(value: unknown): value is FreshnessRecord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.questionId === "string" &&
    typeof candidate.examDate === "string" &&
    typeof candidate.legacySubject === "string" &&
    (candidate.currentStandard === null || isCurrentStandard(candidate.currentStandard)) &&
    candidate.status === "unverified" &&
    candidate.delta === null &&
    candidate.verifiedBy === null &&
    typeof candidate.note === "string"
  );
}

// Kept in sync with scripts/build-freshness.mjs, which independently generates
// the 880-record offline/audit JSON from the same two legacy subjects.
export const TEST_STANDARD_SUBJECT = "폐기물 공정시험기준";
export const LAW_SUBJECT = "폐기물 관계 법규";

const CURRENT_STANDARD: CurrentStandard = {
  name: "폐기물공정시험기준",
  ref: "국립환경과학원고시 제2025-21호",
  effective: "2025-08-06",
  url: "https://www.law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=2100000263068",
};

function noteForTestStandard(): string {
  return "이 문항은 시행 당시 기준으로 출제되었으며, 현행 고시와의 개별 비교·검증은 이루어지지 않았습니다.";
}

function noteForLaw(): string {
  return "이 문항은 시행 당시 관계 법규를 기준으로 출제되었으며, 개별 조항의 현행 여부에 대한 검증은 이루어지지 않았습니다.";
}

export type FreshnessNotice = {
  note: string;
  currentStandard: CurrentStandard | null;
};

export function getFreshnessNotice(subject: string): FreshnessNotice | undefined {
  if (subject === TEST_STANDARD_SUBJECT) {
    return { note: noteForTestStandard(), currentStandard: CURRENT_STANDARD };
  }
  if (subject === LAW_SUBJECT) {
    return { note: noteForLaw(), currentStandard: null };
  }
  return undefined;
}
