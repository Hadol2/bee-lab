import provenanceData from "../public/data/qnet-official-syllabus/provenance.json" with { type: "json" };
import taxonomyData from "../public/data/qnet-official-syllabus/taxonomy.json" with { type: "json" };

export type Provenance = "official-file";

export type TaxonomyDetail = { id: string; name: string };
export type TaxonomyMinor = { id: string; name: string; details: TaxonomyDetail[] };
export type TaxonomyMajor = { id: string; name: string; minors: TaxonomyMinor[] };
export type TaxonomySubject = {
  id: string;
  name: string;
  questionCount: number;
  majors: TaxonomyMajor[];
};

export type CurrentSubject = {
  key: string;
  name: string;
  questionCount: 20;
  provenance: Provenance;
  domains: { major: string; minor: string[] }[];
};

export const QNET_TAXONOMY = taxonomyData as {
  version: number;
  titleKo: string;
  period: { start: string; end: string };
  examFormat: {
    method: string;
    totalQuestions: number;
    durationMinutes: number;
    subjectCount: number;
    questionsPerSubject: number;
  };
  subjects: TaxonomySubject[];
};

export const QNET_PROVENANCE = provenanceData as {
  version: number;
  source: string;
  url: string;
  query: Record<string, string>;
  reportId: number;
  period: { start: string; end: string };
  examFormat: {
    method: string;
    subjectCount: number;
    questionsPerSubject: number;
    totalQuestions: number;
    durationMinutes: number;
  };
  file: {
    sha256: string;
    bytes: number;
    totalPages: number;
    writtenSyllabusPages: { start: number; end: number };
    practicalSyllabusStartsAtPage: number;
    excludedFromThisMapping: string;
  };
  retrievedAt: string;
  privateCopy: { location: string; filename: string; note: string };
};

export const CURRENT_SYLLABUS_PERIOD = { start: "2026-01-01", end: "2030-12-31" } as const;

export const CURRENT_PASS_RULE = { perSubjectMin: 40, averageMin: 60 } as const;

export const CURRENT_SUBJECT_KEYS = ["subject-1", "subject-2", "subject-3", "subject-4"] as const;

export type CurrentSubjectKey = (typeof CURRENT_SUBJECT_KEYS)[number];

export const CURRENT_SUBJECTS: readonly CurrentSubject[] = QNET_TAXONOMY.subjects.map((subject) => ({
  key: subject.id,
  name: subject.name,
  questionCount: 20,
  provenance: "official-file",
  domains: subject.majors.map((major) => ({
    major: major.name,
    minor: major.minors.map((minor) => minor.name),
  })),
}));

/** Every hierarchy ID that legitimately exists in the official taxonomy (subject/major/minor/detail tiers). */
export function collectValidHierarchyIds(): Set<string> {
  const ids = new Set<string>();
  for (const subject of QNET_TAXONOMY.subjects) {
    ids.add(subject.id);
    for (const major of subject.majors) {
      ids.add(major.id);
      for (const minor of major.minors) {
        ids.add(minor.id);
        for (const detail of minor.details) {
          ids.add(detail.id);
        }
      }
    }
  }
  return ids;
}

export function hierarchyIdSubjectKey(hierarchyId: string): CurrentSubjectKey {
  const [subjectKey] = hierarchyId.split(".");
  return subjectKey as CurrentSubjectKey;
}
