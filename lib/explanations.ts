export type ReviewStatus = "unreviewed" | "machine_checked" | "reviewed";

export type DetailedExplanation = {
  summary: string;
  correctReason: string;
  calculation: string | null;
  examNote: string | null;
};

export type ExplanationResponse = {
  status: "complete";
  explanation: DetailedExplanation;
  reviewStatus: ReviewStatus;
  generatedAt: string;
};

export function isDetailedExplanation(value: unknown): value is DetailedExplanation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.summary === "string" && candidate.summary.trim().length > 0 &&
    typeof candidate.correctReason === "string" && candidate.correctReason.trim().length >= 10 &&
    (candidate.calculation === null ||
      (typeof candidate.calculation === "string" && candidate.calculation.trim().length > 0)) &&
    (candidate.examNote === null ||
      (typeof candidate.examNote === "string" && candidate.examNote.trim().length > 0))
  );
}

export function toReviewStatus(value: unknown): ReviewStatus {
  if (value === "reviewed" || value === "machine_checked") return value;
  return "unreviewed";
}
