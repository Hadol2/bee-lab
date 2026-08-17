"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { authClient } from "../lib/auth/client";
import type { DetailedExplanation, ExplanationResponse, ReviewStatus } from "../lib/explanations";
import {
  calculateSessionScore,
  calculateSubjectScores,
  calculatePassRisk,
  hasCompleteSubjectCoverage,
} from "../lib/session-score";
import {
  captureSessionAttempt,
  restoreSessionAttempt,
  type SavedAttemptState,
} from "../lib/session-attempt";
import {
  FIRST_SYNC_STORAGE_KEY,
  hasCompletedFirstSync,
  parseCompletedFirstSyncIds,
  resolveSyncedWrongIds,
  withCompletedFirstSync,
} from "../lib/wrong-answer-sync";
import {
  OFFICIAL_SUBJECTS,
  createMockExam,
  createSubjectSet,
  type OfficialSubject,
} from "../lib/question-sets";
import manifestData from "../public/data/exams/manifest.json";
import { getFreshnessNotice } from "../lib/freshness";

type Question = {
  id: string;
  number: number;
  subject: string;
  labels: string[];
  text: string;
  choices: string[];
  answer: number;
  explanation: string | null;
  keyPoint: string;
  sourcePage: number;
  visuals: string[];
};

type ExamSummary = {
  date: string;
  label: string;
  count: number;
  dataUrl: string;
};

type ExamData = Omit<ExamSummary, "count" | "dataUrl"> & {
  questions: Question[];
};

type RuntimeQuestion = Question & {
  examDate: string;
  examLabel: string;
};

type SourceMode = "exam" | "subject" | "mock" | "wrong";
type ReviewMode = "all" | "bookmark";
type SyncState = "local" | "loading" | "synced" | "saving" | "error";
type ExplanationState = "loading" | "missing" | "error";
type ReportCategory = "answer" | "explanation" | "question" | "source";
type ReportState = "idle" | "saving" | "sent" | "error";
type SavedGeneratedSession = {
  questions: RuntimeQuestion[];
  sessionLabel: string;
  currentId: string;
  selectedSubject: OfficialSubject;
  mockSubmitted: boolean;
};

const exams = manifestData as ExamSummary[];
const choiceMarks = ["①", "②", "③", "④"];
const SUBJECT_COUNT_OPTIONS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const storageKey = "waste-cbt-progress-v2";
let libraryPromise: Promise<RuntimeQuestion[]> | null = null;

function withExam(question: Question, exam: ExamData): RuntimeQuestion {
  return {
    ...question,
    examDate: exam.date,
    examLabel: exam.label,
  };
}

async function fetchExam(summary: ExamSummary): Promise<ExamData> {
  const response = await fetch(summary.dataUrl);
  if (!response.ok) throw new Error("exam load failed");
  return response.json() as Promise<ExamData>;
}

function loadLibrary(): Promise<RuntimeQuestion[]> {
  libraryPromise ??= Promise.all(exams.map(fetchExam)).then((items) =>
    items.flatMap((exam) => exam.questions.map((question) => withExam(question, exam))),
  );
  return libraryPromise;
}

function getSessionKey(mode: SourceMode, examDate: string, items: RuntimeQuestion[]) {
  if (mode === "exam") return `exam:${examDate}`;
  return `${mode}:${items.map((item) => item.id).join(",")}`;
}

export default function QuizApp({
  initialUser,
}: {
  initialUser: { id: string; displayName: string } | null;
}) {
  const [sourceMode, setSourceMode] = useState<SourceMode>("exam");
  const [selectedExam, setSelectedExam] = useState(exams[0].date);
  const [selectedSubject, setSelectedSubject] = useState<OfficialSubject>(OFFICIAL_SUBJECTS[0]);
  const [selectedSubjectCount, setSelectedSubjectCount] = useState(20);
  const [questions, setQuestions] = useState<RuntimeQuestion[]>([]);
  const [sessionLabel, setSessionLabel] = useState(exams[0].label);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [examLoadRetry, setExamLoadRetry] = useState(0);
  const [currentId, setCurrentId] = useState("");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState<string[]>([]);
  const [wrongIds, setWrongIds] = useState<string[]>([]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [elapsedBySession, setElapsedBySession] = useState<Record<string, number>>({});
  const [showPanel, setShowPanel] = useState(false);
  const [showLearningHome, setShowLearningHome] = useState(true);
  const [showQuestionSheet, setShowQuestionSheet] = useState(false);
  const [reviewMode, setReviewMode] = useState<ReviewMode>("all");
  const [selectedLabel, setSelectedLabel] = useState("전체 유형");
  const [mockSubmitted, setMockSubmitted] = useState(false);
  const [showSessionResult, setShowSessionResult] = useState(false);
  const [savedGeneratedSessions, setSavedGeneratedSessions] = useState<
    Partial<Record<Exclude<SourceMode, "exam">, SavedGeneratedSession>>
  >({});
  const [savedAttemptStates, setSavedAttemptStates] = useState<Record<string, SavedAttemptState>>({});
  const [activeSessionKey, setActiveSessionKey] = useState(`exam:${exams[0].date}`);
  const [hydrated, setHydrated] = useState(false);
  const [syncReady, setSyncReady] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>(initialUser ? "loading" : "local");
  const syncAccountIdRef = useRef<string | null>(null);
  const pendingFirstSyncAccountIdRef = useRef<string | null>(null);
  const syncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const syncSequenceRef = useRef(0);
  const [syncRetryToken, setSyncRetryToken] = useState(0);
  const [detailedExplanations, setDetailedExplanations] = useState<
    Record<string, DetailedExplanation>
  >({});
  const [explanationReviewStatus, setExplanationReviewStatus] = useState<
    Record<string, ReviewStatus>
  >({});
  const [explanationStates, setExplanationStates] = useState<
    Record<string, ExplanationState>
  >({});
  const [reportOpenId, setReportOpenId] = useState<string | null>(null);
  const [reportCategory, setReportCategory] = useState<ReportCategory>("explanation");
  const [reportDetails, setReportDetails] = useState("");
  const [reportState, setReportState] = useState<ReportState>("idle");
  const answersRef = useRef(answers);
  const checkedRef = useRef(checked);
  const savedAttemptStatesRef = useRef(savedAttemptStates);
  const activeSessionKeyRef = useRef(activeSessionKey);
  answersRef.current = answers;
  checkedRef.current = checked;
  savedAttemptStatesRef.current = savedAttemptStates;
  activeSessionKeyRef.current = activeSessionKey;

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        // Browser-only saved progress is intentionally restored after hydration.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAnswers(data.answers ?? {});
        setChecked(data.checked ?? []);
        setWrongIds(data.wrongIds ?? []);
        setBookmarks(data.bookmarks ?? []);
        setElapsedBySession(data.elapsedBySession ?? {});
        setSavedAttemptStates(data.savedAttemptStates ?? {});
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        answers,
        checked,
        wrongIds,
        bookmarks,
        elapsedBySession,
        savedAttemptStates,
      }),
    );
  }, [answers, checked, wrongIds, bookmarks, elapsedBySession, savedAttemptStates, hydrated]);

  useEffect(() => {
    if (!hydrated || !initialUser) return;
    syncAccountIdRef.current = null;
    pendingFirstSyncAccountIdRef.current = null;
    // Reset the account gate before any save effect can observe the new user.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSyncReady(false);
    setSyncState("loading");
    let active = true;
    fetch("/api/progress")
      .then((response) => {
        if (!response.ok) throw new Error("sync unavailable");
        return response.json() as Promise<{ wrongIds: string[] }>;
      })
      .then((remote) => {
        if (!active) return;
        const completedIds = parseCompletedFirstSyncIds(
          window.localStorage.getItem(FIRST_SYNC_STORAGE_KEY),
        );
        const isFirstSync = !hasCompletedFirstSync(initialUser.id, completedIds);
        setWrongIds((local) => resolveSyncedWrongIds(isFirstSync, local, remote.wrongIds ?? []));
        pendingFirstSyncAccountIdRef.current = isFirstSync ? initialUser.id : null;
        syncAccountIdRef.current = initialUser.id;
        setSyncReady(true);
        setSyncState(isFirstSync ? "saving" : "synced");
      })
      .catch(() => {
        if (active) setSyncState("error");
      });
    return () => {
      active = false;
    };
  }, [hydrated, initialUser, syncRetryToken]);

  function persistWrongIds(ids: string[]) {
    const sequence = ++syncSequenceRef.current;
    const payload = [...ids];
    setSyncState("saving");
    const operation = syncQueueRef.current.then(async () => {
      const response = await fetch("/api/progress", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wrongIds: payload }),
      });
      if (!response.ok) throw new Error("sync failed");
      const pending = pendingFirstSyncAccountIdRef.current;
      if (pending && sequence === syncSequenceRef.current) {
        const completedIds = parseCompletedFirstSyncIds(
          window.localStorage.getItem(FIRST_SYNC_STORAGE_KEY),
        );
        window.localStorage.setItem(
          FIRST_SYNC_STORAGE_KEY,
          JSON.stringify(withCompletedFirstSync(pending, completedIds)),
        );
        pendingFirstSyncAccountIdRef.current = null;
      }
    });
    syncQueueRef.current = operation.then(() => undefined, () => undefined);
    return operation.then(
      () => {
        if (sequence === syncSequenceRef.current) setSyncState("synced");
      },
      () => {
        if (sequence === syncSequenceRef.current) setSyncState("error");
      },
    );
  }

  useEffect(() => {
    if (!syncReady || !initialUser || syncAccountIdRef.current !== initialUser.id) return;
    const timer = window.setTimeout(() => void persistWrongIds(wrongIds), 700);
    return () => window.clearTimeout(timer);
  }, [wrongIds, syncReady, initialUser]);

  function retrySync() {
    if (!initialUser) return;
    if (!syncReady) {
      setSyncState("loading");
      setSyncRetryToken((value) => value + 1);
      return;
    }
    void persistWrongIds(wrongIds);
  }

  useEffect(() => {
    if (sourceMode !== "exam" || !hydrated) return;
    let active = true;
    const summary = exams.find((item) => item.date === selectedExam) ?? exams[0];
    fetchExam(summary)
      .then((exam) => {
        if (!active) return;
        const next = exam.questions.map((question) => withExam(question, exam));
        const nextSessionKey = getSessionKey("exam", exam.date, next);
        const savedAttempt = savedAttemptStatesRef.current[nextSessionKey];
        if (savedAttempt) restoreAttempt(next, savedAttempt);
        activeSessionKeyRef.current = nextSessionKey;
        setActiveSessionKey(nextSessionKey);
        setQuestions(next);
        setSessionLabel(exam.label);
        setCurrentId(next[0]?.id ?? "");
        setShowSessionResult(
          calculateSessionScore(
            next,
            savedAttempt?.answers ?? answersRef.current,
            savedAttempt?.checked ?? checkedRef.current,
            false,
          ).complete,
        );
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setLoadError(true);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [selectedExam, sourceMode, hydrated, examLoadRetry]);

  const [documentHidden, setDocumentHidden] = useState(
    () => typeof document !== "undefined" && document.hidden,
  );

  useEffect(() => {
    function handleVisibility() {
      setDocumentHidden(document.hidden);
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    if (!showQuestionSheet) return;
    const previousOverflow = document.body.style.overflow;
    const desktopViewport = window.matchMedia("(min-width: 761px)");
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setShowQuestionSheet(false);
    }
    function handleViewportChange(event: MediaQueryListEvent) {
      if (event.matches) setShowQuestionSheet(false);
    }
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    desktopViewport.addEventListener("change", handleViewportChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      desktopViewport.removeEventListener("change", handleViewportChange);
    };
  }, [showQuestionSheet]);

  const labelOptions = useMemo(() => {
    const labels = new Set<string>();
    questions.forEach((question) => question.labels.forEach((label) => labels.add(label)));
    return ["전체 유형", ...labels];
  }, [questions]);

  const visibleQuestions = useMemo(() => {
    return questions.filter((question) => {
      if (selectedLabel !== "전체 유형" && !question.labels.includes(selectedLabel)) return false;
      return reviewMode === "bookmark" ? bookmarks.includes(question.id) : true;
    });
  }, [questions, selectedLabel, reviewMode, bookmarks]);

  useEffect(() => {
    if (visibleQuestions.length && !visibleQuestions.some((question) => question.id === currentId)) {
      // Keep navigation anchored when a filter removes the current question.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentId(visibleQuestions[0].id);
    }
  }, [visibleQuestions, currentId]);

  const question = visibleQuestions.find((item) => item.id === currentId) ?? visibleQuestions[0];
  const currentPosition = question
    ? visibleQuestions.findIndex((item) => item.id === question.id)
    : -1;
  const selected = question ? answers[question.id] : undefined;
  const detailedExplanation = question ? detailedExplanations[question.id] : undefined;
  const freshness = question ? getFreshnessNotice(question.subject) : undefined;
  const explanationReview = question ? explanationReviewStatus[question.id] : undefined;
  const isMock = sourceMode === "mock";
  const isChecked = question
    ? isMock
      ? mockSubmitted
      : checked.includes(question.id)
    : false;
  const sessionIds = useMemo(() => new Set(questions.map((item) => item.id)), [questions]);
  const sessionScore = calculateSessionScore(
    questions,
    answers,
    checked,
    isMock && mockSubmitted,
  );
  const answeredInSession = sessionScore.answered;
  const checkedInSession = checked.filter((id) => sessionIds.has(id));
  const correctCount = sessionScore.correct;
  const wrongInSession = wrongIds.filter((id) => sessionIds.has(id));
  const bookmarksInSession = bookmarks.filter((id) => sessionIds.has(id));
  const completedCount = isMock && !mockSubmitted ? answeredInSession : sessionScore.evaluated;
  const progress = questions.length ? Math.round((completedCount / questions.length) * 100) : 0;
  const statusPercent = sessionScore.complete ? sessionScore.accuracy : progress;
  const elapsed = elapsedBySession[activeSessionKey] ?? 0;
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const seconds = String(elapsed % 60).padStart(2, "0");
  const subjectScores = useMemo(
    () => calculateSubjectScores(questions, answers, checked, isMock && mockSubmitted),
    [questions, answers, checked, isMock, mockSubmitted],
  );
  const weakestSubject = useMemo(
    () => subjectScores.reduce<(typeof subjectScores)[number] | null>(
      (weakest, item) => !weakest || item.score < weakest.score ? item : weakest,
      null,
    ),
    [subjectScores],
  );
  const passRisk = useMemo(() => calculatePassRisk(subjectScores), [subjectScores]);
  const showsPassSignal =
    sourceMode !== "wrong" &&
    hasCompleteSubjectCoverage(subjectScores, OFFICIAL_SUBJECTS);

  const isSessionActive =
    !showLearningHome && !loading && !loadError && questions.length > 0 && !sessionScore.complete;

  useEffect(() => {
    if (!isSessionActive || documentHidden) return;
    const timer = window.setInterval(
      () => setElapsedBySession((items) => ({
        ...items,
        [activeSessionKey]: (items[activeSessionKey] ?? 0) + 1,
      })),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [isSessionActive, documentHidden, activeSessionKey]);
  const syncLabel = {
    local: "이 기기에 저장",
    loading: "오답 불러오는 중",
    synced: "오답 동기화됨",
    saving: "오답 저장 중",
    error: "동기화 재시도 필요",
  }[syncState];

  async function loadDetailedExplanation(questionId: string) {
    setExplanationStates((items) => ({ ...items, [questionId]: "loading" }));
    try {
      const response = await fetch(`/api/explanations/${questionId}`);
      if (response.status === 404) {
        setExplanationStates((items) => ({ ...items, [questionId]: "missing" }));
        return;
      }
      if (!response.ok) throw new Error("explanation unavailable");
      const data = (await response.json()) as ExplanationResponse;
      setDetailedExplanations((items) => ({
        ...items,
        [questionId]: data.explanation,
      }));
      setExplanationReviewStatus((items) => ({
        ...items,
        [questionId]: data.reviewStatus,
      }));
      setExplanationStates((items) => {
        const next = { ...items };
        delete next[questionId];
        return next;
      });
    } catch {
      setExplanationStates((items) => ({ ...items, [questionId]: "error" }));
    }
  }

  useEffect(() => {
    if (!question || !isChecked) return;
    if (detailedExplanations[question.id] || explanationStates[question.id]) return;
    const timer = window.setTimeout(() => void loadDetailedExplanation(question.id), 0);
    return () => window.clearTimeout(timer);
    // Only the active question and its answer state should trigger loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.id, isChecked]);

  function writeAttemptState(key: string, attempt: SavedAttemptState) {
    savedAttemptStatesRef.current = {
      ...savedAttemptStatesRef.current,
      [key]: attempt,
    };
    setSavedAttemptStates(savedAttemptStatesRef.current);
  }

  function saveCurrentAttempt() {
    if (!questions.length) return;
    writeAttemptState(
      activeSessionKeyRef.current,
      captureSessionAttempt(
        questions.map((item) => item.id),
        answersRef.current,
        checkedRef.current,
        mockSubmitted,
      ),
    );
  }

  function restoreAttempt(next: RuntimeQuestion[], attempt: SavedAttemptState) {
    const restored = restoreSessionAttempt(
      next.map((item) => item.id),
      answersRef.current,
      checkedRef.current,
      attempt,
    );
    answersRef.current = restored.answers;
    checkedRef.current = restored.checked;
    setAnswers(restored.answers);
    setChecked(restored.checked);
    return restored;
  }

  function resetAttempt(next: RuntimeQuestion[], nextMode: SourceMode = sourceMode) {
    const ids = new Set(next.map((item) => item.id));
    setAnswers((items) =>
      Object.fromEntries(Object.entries(items).filter(([id]) => !ids.has(id))),
    );
    setChecked((items) => items.filter((id) => !ids.has(id)));
    setCurrentId(next[0]?.id ?? "");
    setReviewMode("all");
    setSelectedLabel("전체 유형");
    setMockSubmitted(false);
    setShowSessionResult(false);
    const nextSessionKey = getSessionKey(nextMode, next[0]?.examDate ?? selectedExam, next);
    activeSessionKeyRef.current = nextSessionKey;
    setActiveSessionKey(nextSessionKey);
    writeAttemptState(nextSessionKey, { answers: {}, checked: [], mockSubmitted: false });
    setElapsedBySession((items) => ({ ...items, [nextSessionKey]: 0 }));
  }

  function selectExam(date: string) {
    if (loading) return;
    const isNewContext = date !== selectedExam || sourceMode !== "exam";
    if (!isNewContext) {
      if (loadError) {
        retryCurrentExam();
        return;
      }
      setReviewMode("all");
      setSelectedLabel("전체 유형");
      if (sessionScore.complete) setShowSessionResult(true);
      return;
    }
    if (!confirmReplaceInProgressSet()) return;
    saveCurrentAttempt();
    saveCurrentGeneratedSession();
    setLoading(true);
    setLoadError(false);
    setSourceMode("exam");
    setSelectedExam(date);
    setReviewMode("all");
    setSelectedLabel("전체 유형");
    setMockSubmitted(false);
    setShowSessionResult(false);
  }

  function retryCurrentExam() {
    if (sourceMode !== "exam" || loading) return;
    setLoading(true);
    setLoadError(false);
    setExamLoadRetry((value) => value + 1);
  }

  function confirmReplaceInProgressSet() {
    const inProgressGeneratedSet =
      (sourceMode === "subject" || sourceMode === "mock" || sourceMode === "wrong") &&
      !sessionScore.complete &&
      (answeredInSession > 0 || checkedInSession.length > 0);
    if (!inProgressGeneratedSet) return true;
    return window.confirm("진행 중인 답안과 채점이 사라집니다. 새 세트를 만들까요?");
  }

  function saveCurrentGeneratedSession() {
    if (sourceMode === "exam" || !questions.length) return;
    setSavedGeneratedSessions((items) => ({
      ...items,
      [sourceMode]: {
        questions,
        sessionLabel,
        currentId,
        selectedSubject,
        mockSubmitted,
      },
    }));
  }

  function restoreGeneratedSession(mode: Exclude<SourceMode, "exam">) {
    if (loading) return true;
    if (sourceMode === mode) {
      if (sessionScore.complete) setShowSessionResult(true);
      return true;
    }
    const saved = savedGeneratedSessions[mode];
    if (!saved) return false;
    if (!confirmReplaceInProgressSet()) return true;
    saveCurrentAttempt();
    saveCurrentGeneratedSession();
    const savedAttempt = savedAttemptStatesRef.current[
      getSessionKey(mode, selectedExam, saved.questions)
    ];
    const restored = savedAttempt
      ? restoreAttempt(saved.questions, savedAttempt)
      : { answers: answersRef.current, checked: checkedRef.current };
    const restoredSessionKey = getSessionKey(mode, saved.questions[0]?.examDate ?? selectedExam, saved.questions);
    activeSessionKeyRef.current = restoredSessionKey;
    setActiveSessionKey(restoredSessionKey);
    setQuestions(saved.questions);
    setSessionLabel(saved.sessionLabel);
    setCurrentId(saved.currentId || saved.questions[0]?.id || "");
    setSelectedSubject(saved.selectedSubject);
    setMockSubmitted(savedAttempt?.mockSubmitted ?? saved.mockSubmitted);
    setSourceMode(mode);
    setReviewMode("all");
    setSelectedLabel("전체 유형");
    setLoadError(false);
    setLoading(false);
    const complete = calculateSessionScore(
      saved.questions,
      restored.answers,
      restored.checked,
      mode === "mock" && (savedAttempt?.mockSubmitted ?? saved.mockSubmitted),
    ).complete;
    setShowSessionResult(complete);
    return true;
  }

  function enterSubjectSession() {
    if (!restoreGeneratedSession("subject")) void startSubject();
  }

  function enterMockSession() {
    if (!restoreGeneratedSession("mock")) void startMockExam();
  }

  function enterWrongSession() {
    if (!restoreGeneratedSession("wrong")) void startWrongRetry();
  }

  async function startSubject(subject = selectedSubject, count = selectedSubjectCount) {
    if (loading) return false;
    if (!confirmReplaceInProgressSet()) return false;
    saveCurrentAttempt();
    saveCurrentGeneratedSession();
    setLoading(true);
    setLoadError(false);
    setSelectedSubject(subject);
    setSelectedSubjectCount(count);
    try {
      const next = createSubjectSet(await loadLibrary(), subject, count);
      setQuestions(next);
      setSessionLabel(`${subject} · 무작위 ${count}문제`);
      setSourceMode("subject");
      resetAttempt(next, "subject");
      setSavedGeneratedSessions((items) => ({
        ...items,
        subject: {
          questions: next,
          sessionLabel: `${subject} · 무작위 ${count}문제`,
          currentId: next[0]?.id ?? "",
          selectedSubject: subject,
          mockSubmitted: false,
        },
      }));
      return true;
    } catch {
      setLoadError(true);
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function startMockExam() {
    if (loading) return false;
    if (!confirmReplaceInProgressSet()) return false;
    saveCurrentAttempt();
    saveCurrentGeneratedSession();
    setLoading(true);
    setLoadError(false);
    try {
      const next = createMockExam(await loadLibrary());
      setQuestions(next);
      setSessionLabel("실전 모의고사 · 5과목 × 20문제");
      setSourceMode("mock");
      resetAttempt(next, "mock");
      setSavedGeneratedSessions((items) => ({
        ...items,
        mock: {
          questions: next,
          sessionLabel: "실전 모의고사 · 5과목 × 20문제",
          currentId: next[0]?.id ?? "",
          selectedSubject,
          mockSubmitted: false,
        },
      }));
      return true;
    } catch {
      setLoadError(true);
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function startWrongRetry() {
    if (loading) return false;
    if (!wrongIds.length) return false;
    if (!confirmReplaceInProgressSet()) return false;
    saveCurrentAttempt();
    saveCurrentGeneratedSession();
    setLoading(true);
    setLoadError(false);
    try {
      const wrongSet = new Set(wrongIds);
      const next = (await loadLibrary()).filter((item) => wrongSet.has(item.id));
      setQuestions(next);
      setSessionLabel(`내 오답 · ${next.length}문제`);
      setSourceMode("wrong");
      resetAttempt(next, "wrong");
      setSavedGeneratedSessions((items) => ({
        ...items,
        wrong: {
          questions: next,
          sessionLabel: `내 오답 · ${next.length}문제`,
          currentId: next[0]?.id ?? "",
          selectedSubject,
          mockSubmitted: false,
        },
      }));
      setShowPanel(false);
      return true;
    } catch {
      setLoadError(true);
      return false;
    } finally {
      setLoading(false);
    }
  }

  function changeSource(value: SourceMode) {
    if (value === "exam") selectExam(selectedExam);
    if (value === "subject") enterSubjectSession();
    if (value === "mock") enterMockSession();
    if (value === "wrong") enterWrongSession();
  }

  function openCurrentSession() {
    setShowLearningHome(false);
    setShowQuestionSheet(false);
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
  }

  function openLearningHome() {
    setShowLearningHome(true);
    setShowPanel(false);
    setShowQuestionSheet(false);
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
  }

  function toggleLearningStatus() {
    if (showLearningHome) {
      setShowLearningHome(false);
      setShowPanel(true);
      window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
      return;
    }
    setShowPanel((visible) => !visible);
  }

  async function startSubjectFromHome() {
    if (await startSubject()) openCurrentSession();
  }

  async function startMockFromHome() {
    if (await startMockExam()) openCurrentSession();
  }

  async function startWrongFromHome() {
    if (await startWrongRetry()) openCurrentSession();
  }

  function openQuestionFromSheet(questionId: string) {
    setCurrentId(questionId);
    setShowQuestionSheet(false);
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
  }

  function move(step: number) {
    if (!visibleQuestions.length) return;
    const nextPosition = Math.min(
      Math.max(currentPosition + step, 0),
      visibleQuestions.length - 1,
    );
    setCurrentId(visibleQuestions[nextPosition].id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function changeReviewMode(nextMode: ReviewMode) {
    setReviewMode(nextMode);
    const candidates = questions.filter((item) =>
      nextMode === "bookmark" ? bookmarks.includes(item.id) : true,
    );
    if (candidates.length) setCurrentId(candidates[0].id);
  }

  function chooseAnswer(targetQuestion: RuntimeQuestion, answer: number) {
    const nextAnswers = { ...answersRef.current, [targetQuestion.id]: answer };
    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);

    if (isMock) {
      writeAttemptState(
        activeSessionKeyRef.current,
        captureSessionAttempt(
          questions.map((item) => item.id),
          nextAnswers,
          checkedRef.current,
          mockSubmitted,
        ),
      );
      return;
    }

    // Non-mock choices reveal the answer immediately, so selecting doubles as checking.
    const completesSession = checkedInSession.length + 1 === questions.length;
    const nextChecked = checked.includes(targetQuestion.id) ? checked : [...checked, targetQuestion.id];
    checkedRef.current = nextChecked;
    setChecked(nextChecked);
    writeAttemptState(
      activeSessionKeyRef.current,
      captureSessionAttempt(
        questions.map((item) => item.id),
        nextAnswers,
        nextChecked,
        false,
      ),
    );
    setWrongIds((items) => {
      if (answer === targetQuestion.answer) return items.filter((id) => id !== targetQuestion.id);
      return items.includes(targetQuestion.id) ? items : [...items, targetQuestion.id];
    });
    if (completesSession) {
      setShowSessionResult(true);
      setShowPanel(false);
      window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
    }
  }

  function submitMockExam() {
    if (!window.confirm(`${answeredInSession}/${questions.length}문제에 답했습니다. 답안을 제출할까요?`)) return;
    const ids = questions.map((item) => item.id);
    setChecked((items) => [...new Set([...items, ...ids])]);
    setWrongIds((items) => {
      const next = new Set(items);
      questions.forEach((item) => {
        if (answers[item.id] === item.answer) next.delete(item.id);
        else next.add(item.id);
      });
      return [...next];
    });
    setMockSubmitted(true);
    writeAttemptState(
      activeSessionKeyRef.current,
      captureSessionAttempt(ids, answersRef.current, ids, true),
    );
    setSavedGeneratedSessions((items) => items.mock ? {
      ...items,
      mock: { ...items.mock, currentId, mockSubmitted: true },
    } : items);
    setShowSessionResult(true);
    setShowPanel(false);
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
  }

  function reviewSessionResult() {
    const firstIncorrect = questions.find(
      (item) => answers[item.id] !== item.answer,
    );
    setReviewMode("all");
    setSelectedLabel("전체 유형");
    setCurrentId(firstIncorrect?.id ?? questions[0]?.id ?? "");
    setShowSessionResult(false);
  }

  function restartSession() {
    resetAttempt(questions);
  }

  function toggleBookmark() {
    if (!question) return;
    setBookmarks((items) =>
      items.includes(question.id)
        ? items.filter((id) => id !== question.id)
        : [...items, question.id],
    );
  }

  function toggleReportForm() {
    if (!question) return;
    if (reportOpenId === question.id) {
      setReportOpenId(null);
      return;
    }
    setReportOpenId(question.id);
    setReportCategory("explanation");
    setReportDetails("");
    setReportState("idle");
  }

  async function submitReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question || reportDetails.trim().length < 10) return;
    setReportState("saving");
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          questionId: question.id,
          category: reportCategory,
          details: reportDetails,
        }),
      });
      if (!response.ok) throw new Error("report failed");
      setReportState("sent");
    } catch {
      setReportState("error");
    }
  }

  async function signOut() {
    await authClient.signOut();
    window.location.href = "/";
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={openLearningHome} aria-label="폐기물처리기사 학습 홈">
          <span className="brand-mark">W</span>
          <span>폐기물처리기사</span>
        </button>
        <div className="top-actions">
          <span className="library-count">5과목 · 2,200문제</span>
          <span className="save-state">
            <i /> {syncLabel}
            {syncState === "error" && (
              <button className="sync-retry" onClick={retrySync}>다시 시도</button>
            )}
          </span>
          {initialUser ? (
            <button className="account-button" onClick={() => setShowPanel(true)}>{initialUser.displayName.slice(0, 8)}</button>
          ) : (
            <Link className="login-button" href="/auth/sign-in">로그인</Link>
          )}
          <button className="status-button" onClick={toggleLearningStatus} aria-label="학습 현황 열기">
            <strong>{sessionScore.complete ? `${sessionScore.accuracy}%` : `${completedCount}/${questions.length || 100}`}</strong>
            <small>{sessionScore.complete ? "정답률" : "진행"}</small>
          </button>
        </div>
      </header>

      <main className={`workspace ${showLearningHome ? "home-workspace" : ""}`} id="top">
        {showLearningHome ? (
          <section className="learning-home" aria-labelledby="learning-home-title">
            <div className="home-hero">
              <div>
                <span className="home-kicker">오늘의 학습</span>
                <h1 id="learning-home-title">부담 없이 시작하고, 틀린 문제까지 끝내세요.</h1>
                <p>짧게 풀려면 과목별 {selectedSubjectCount}문제, 실전처럼 점검하려면 100문제 모의고사를 선택하세요.</p>
              </div>
              <div className="home-library" role="group" aria-label="문제은행 구성">
                <div><strong>2,200</strong><span>전체 문제</span></div>
                <div><strong>22</strong><span>기출 회차</span></div>
                <div><strong>5</strong><span>필기 과목</span></div>
              </div>
            </div>

            <div className="home-section-heading">
              <div><span>바로 시작하기</span><h2>지금 필요한 학습을 고르세요</h2></div>
              {answeredInSession > 0 && <small>현재 세트 {completedCount}/{questions.length} 진행 중</small>}
            </div>

            <div className="learning-cards">
              <article className="learning-card continue-card">
                <span className="learning-card-index">이어가기</span>
                <h3>{sessionScore.complete ? "완료한 세트 결과 보기" : answeredInSession > 0 ? "풀던 세트 계속하기" : "최근 기출로 시작하기"}</h3>
                <p>{sessionLabel}</p>
                <div className="learning-card-progress"><span style={{ width: `${progress}%` }} /></div>
                <small>{sessionScore.complete ? `정답률 ${sessionScore.accuracy}%` : `${completedCount}/${questions.length || 100}문제 완료`}</small>
                <button
                  className="home-primary"
                  onClick={loadError && sourceMode === "exam" ? retryCurrentExam : openCurrentSession}
                  disabled={loading}
                >
                  {loadError && sourceMode === "exam"
                    ? "회차 다시 불러오기"
                    : sessionScore.complete
                      ? "결과 보기"
                      : answeredInSession > 0
                        ? "이어서 풀기"
                        : "회차별 시작"}
                </button>
              </article>

              <article className="learning-card quick-card">
                <span className="learning-card-index">추천 · 약 15분</span>
                <h3>과목별 {selectedSubjectCount}문제</h3>
                <p>한 과목만 가볍게 풀고 바로 취약 개념을 확인합니다.</p>
                <label className="home-subject-select">
                  <span>학습 과목</span>
                  <select value={selectedSubject} onChange={(event) => setSelectedSubject(event.target.value as OfficialSubject)} disabled={loading}>
                    {OFFICIAL_SUBJECTS.map((subject, index) => <option key={subject} value={subject}>{index + 1}과목 · {subject}</option>)}
                  </select>
                </label>
                <label className="home-subject-select">
                  <span>문제 수</span>
                  <select value={selectedSubjectCount} onChange={(event) => setSelectedSubjectCount(Number(event.target.value))} disabled={loading}>
                    {SUBJECT_COUNT_OPTIONS.map((count) => <option key={count} value={count}>{count}문제</option>)}
                  </select>
                </label>
                <button className="home-primary" onClick={() => void startSubjectFromHome()} disabled={loading}>{selectedSubjectCount}문제 시작</button>
              </article>

              <article className="learning-card mock-card">
                <span className="learning-card-index">실전 점검</span>
                <h3>100문제 모의고사</h3>
                <p>5과목에서 20문제씩 섞어 과락 위험과 평균 점수를 확인합니다.</p>
                <div className="card-fact"><b>5 × 20</b><span>답안 제출 전까지 정답 비공개</span></div>
                <button className="home-secondary" onClick={() => void startMockFromHome()} disabled={loading}>모의고사 구성</button>
              </article>

              <article className={`learning-card wrong-card ${wrongIds.length ? "has-wrong" : ""}`}>
                <span className="learning-card-index">빠른 복습</span>
                <h3>틀린 문제 다시 풀기</h3>
                <p>{wrongIds.length ? `저장된 오답 ${wrongIds.length}문제를 다시 섞어 풀 수 있습니다.` : "문제를 채점하면 틀린 문제를 자동으로 모아드립니다."}</p>
                <div className="wrong-count"><strong>{wrongIds.length}</strong><span>오답</span></div>
                <button className="home-secondary" onClick={() => void startWrongFromHome()} disabled={loading || !wrongIds.length}>오답 복습 시작</button>
              </article>
            </div>

            <p className="home-footnote">로그인하지 않아도 바로 풀 수 있습니다. 로그인하면 오답 목록을 다른 기기와 동기화할 수 있습니다.</p>
          </section>
        ) : (
          <>
        <aside className="left-rail" aria-label="학습 방식 및 문제 목록">
          <div className="eyebrow">학습 방식</div>
          <div className="source-list">
            <button className={sourceMode === "exam" ? "active" : ""} onClick={() => selectExam(selectedExam)} disabled={loading}><span>회차별 풀이</span><small>100문제</small></button>
            <button className={sourceMode === "subject" ? "active" : ""} onClick={enterSubjectSession} disabled={loading}><span>과목별 풀이</span><small>{selectedSubjectCount}문제</small></button>
            <button className={sourceMode === "mock" ? "active" : ""} onClick={enterMockSession} disabled={loading}><span>실전 모의고사</span><small>5×20</small></button>
            <button className={sourceMode === "wrong" ? "active" : ""} onClick={enterWrongSession} disabled={loading || (!wrongIds.length && !savedGeneratedSessions.wrong)}><span>내 오답</span><small>{wrongIds.length || savedGeneratedSessions.wrong?.questions.length || 0}</small></button>
          </div>

          <div className="rail-divider" />
          {sourceMode === "exam" && (
            <>
              <div className="eyebrow">기출 회차</div>
              <div className="exam-list">
                {exams.map((item) => (
                  <button className={`exam-item ${item.date === selectedExam ? "active" : ""}`} key={item.date} onClick={() => selectExam(item.date)} disabled={loading}>
                    <span>{item.label}</span><small>{item.count}문제</small>
                  </button>
                ))}
              </div>
              <div className="rail-divider" />
            </>
          )}
          {sourceMode === "subject" && (
            <>
              <div className="eyebrow">필기 5과목</div>
              <div className="subject-list">
                {OFFICIAL_SUBJECTS.map((subject, index) => (
                  <button className={subject === selectedSubject ? "active" : ""} key={subject} onClick={() => void startSubject(subject)} disabled={loading}>
                    <b>{index + 1}</b><span>{subject}</span>
                  </button>
                ))}
              </div>
              <div className="rail-divider" />
            </>
          )}
          {sourceMode === "mock" && (
            <div className="blueprint-card">
              <b>출제 구성</b>
              {OFFICIAL_SUBJECTS.map((subject, index) => <p key={subject}>{index + 1}과목 <span>{subject}</span><strong>20</strong></p>)}
            </div>
          )}

          <div className="eyebrow row-between"><span>문제</span><span>{completedCount}/{questions.length || 100}</span></div>
          <div className="question-grid">
            {visibleQuestions.map((item, index) => {
              const answered = isMock && !mockSubmitted ? answers[item.id] !== undefined : checked.includes(item.id);
              const correct = checked.includes(item.id) && answers[item.id] === item.answer;
              return (
                <button
                  key={item.id}
                  className={`question-dot ${question?.id === item.id ? "current" : ""} ${answered && checked.includes(item.id) ? (correct ? "correct" : "wrong") : answered ? "answered" : ""}`}
                  onClick={() => setCurrentId(item.id)}
                  aria-label={`${index + 1}번 문제`}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>

          <div className="legend">
            <span><i className="legend-dot correct" /> 정답</span>
            <span><i className="legend-dot wrong" /> 오답</span>
          </div>
        </aside>

        <section className="study-area">
          <div className="study-header">
            <div>
              <div className="crumb">폐기물처리기사 · {sessionLabel}</div>
              <h1>{isMock ? "실전 모의고사" : "기출문제 집중 학습"}</h1>
            </div>
            <div className="study-header-actions">
              <div className="timer" aria-label={`학습 시간 ${minutes}분 ${seconds}초`}>
                <span className="timer-dot" /><b>{minutes}:{seconds}</b>
              </div>
              {sessionScore.complete && !showSessionResult && (
                <button className="secondary-button result-reopen" onClick={() => setShowSessionResult(true)}>
                  결과 보기
                </button>
              )}
            </div>
          </div>

          <div className="study-filters">
            <label>
              <span>학습 방식</span>
              <select value={sourceMode} onChange={(event) => changeSource(event.target.value as SourceMode)} disabled={loading}>
                <option value="exam">회차별 풀이</option>
                <option value="subject">과목별 풀이</option>
                <option value="mock">실전 모의고사</option>
                <option value="wrong" disabled={!wrongIds.length && !savedGeneratedSessions.wrong}>내 오답</option>
              </select>
            </label>
            {sourceMode === "exam" && (
              <label><span>회차</span><select value={selectedExam} onChange={(event) => selectExam(event.target.value)} disabled={loading}>{exams.map((item) => <option key={item.date} value={item.date}>{item.label}</option>)}</select></label>
            )}
            {sourceMode === "subject" && (
              <>
                <label><span>과목</span><select value={selectedSubject} onChange={(event) => void startSubject(event.target.value as OfficialSubject)} disabled={loading}>{OFFICIAL_SUBJECTS.map((subject, index) => <option key={subject} value={subject}>{index + 1}과목 · {subject}</option>)}</select></label>
                <label><span>문제 수</span><select value={selectedSubjectCount} onChange={(event) => void startSubject(selectedSubject, Number(event.target.value))} disabled={loading}>{SUBJECT_COUNT_OPTIONS.map((count) => <option key={count} value={count}>{count}문제</option>)}</select></label>
                <button className="set-button" onClick={() => void startSubject()} disabled={loading}>새 과목 세트 구성</button>
              </>
            )}
            {sourceMode === "mock" && <button className="set-button" onClick={() => void startMockExam()} disabled={loading}>새 모의고사 구성</button>}
            {sourceMode === "wrong" && <button className="set-button" onClick={() => void startWrongRetry()} disabled={loading}>오답 다시 섞기</button>}
            {!isMock && (
              <label><span>세부 유형</span><select value={selectedLabel} onChange={(event) => setSelectedLabel(event.target.value)}>{labelOptions.map((label) => <option key={label}>{label}</option>)}</select></label>
            )}
            {reviewMode === "bookmark" && <button className="mode-chip" onClick={() => changeReviewMode("all")}>저장 문제 보는 중 ×</button>}
          </div>

          <div className="progress-track"><span style={{ width: `${visibleQuestions.length ? ((currentPosition + 1) / visibleQuestions.length) * 100 : 0}%` }} /></div>

          {loading && <div className="loading-card">문제 세트를 구성하는 중입니다…</div>}
          {loadError && !loading && (
            <div className="loading-card error">
              <div>
                <p>문제를 불러오지 못했습니다. 다시 시도해 주세요.</p>
                {sourceMode === "exam" && (
                  <button className="primary-button" onClick={retryCurrentExam}>
                    회차 다시 불러오기
                  </button>
                )}
              </div>
            </div>
          )}
          {!loading && !loadError && !visibleQuestions.length && <div className="loading-card">이 조건에 맞는 문제가 없습니다.</div>}

          {!loading && !loadError && showSessionResult && sessionScore.complete && (
            <section className="session-result" aria-live="polite">
              <span className="result-kicker">세트 완료</span>
              <h2>{sessionLabel}</h2>
              <small className="result-scope">전체 세트 기준 · 필터는 결과에 영향을 주지 않습니다</small>
              <div className="result-score" style={{ "--score": `${sessionScore.accuracy * 3.6}deg` } as React.CSSProperties}>
                <div><strong>{sessionScore.accuracy}</strong><span>%</span><small>정답률</small></div>
              </div>
              <div className="result-stats">
                <div><span>정답</span><b>{sessionScore.correct}</b><small>/{questions.length}</small></div>
                <div><span>오답</span><b>{sessionScore.incorrect}</b><small>문제</small></div>
                <div><span>학습 시간</span><b>{minutes}:{seconds}</b><small>분:초</small></div>
              </div>
              {subjectScores.length > 0 && (
                <div className="subject-scores">
                  <div className="subject-scores-header">
                    <span>{sourceMode === "wrong" ? "오답 세트 과목별 정답" : "과목별 점수"}</span>
                    {showsPassSignal && (
                      <b className={`risk-badge ${passRisk.risk === "합격권" ? "risk-ok" : "risk-warn"}`}>
                        참고 신호 · {passRisk.risk}
                      </b>
                    )}
                  </div>
                  {subjectScores.map((subject) => (
                    <div className="subject-score-row" key={subject.subject}>
                      <span>{subject.subject}</span>
                      <b className={subject.score < 40 ? "risk-warn" : ""}>{subject.correct}/{subject.total}</b>
                      <small>{subject.score}점</small>
                    </div>
                  ))}
                  <p className="risk-note">
                    {sourceMode === "wrong"
                      ? "오답 복습 세트의 구성은 실제 시험과 다르므로 합격 신호를 계산하지 않습니다."
                      : showsPassSignal
                        ? `평균 ${passRisk.average}점 · 과목 40점 이상, 평균 60점 이상이 참고 합격 기준입니다. 실제 합격 여부는 공식 시험 결과를 따릅니다.`
                        : "단일 과목 세트는 해당 과목 점수만 제공하며 합격 신호를 계산하지 않습니다."}
                  </p>
                </div>
              )}
              {weakestSubject && sessionScore.incorrect > 0 && (
                <div className="result-insight">
                  <span>다음 복습 추천</span>
                  <div>
                    <b>{weakestSubject.subject}</b>
                    <strong>{weakestSubject.score}점</strong>
                  </div>
                  <p>이번 세트에서 가장 낮은 과목입니다. 전체 재도전보다 틀린 문제부터 확인하세요.</p>
                </div>
              )}
              <p>{sessionScore.accuracy >= 80 ? "좋은 흐름입니다. 틀린 문제만 다시 확인하면 됩니다." : "틀린 문제의 해설을 확인하고 같은 세트에 한 번 더 도전해 보세요."}</p>
              <div className="result-actions">
                <button className="primary-button" onClick={reviewSessionResult}>{sessionScore.incorrect ? `오답 ${sessionScore.incorrect}문제 확인` : "문제 다시 보기"}</button>
                <button className="secondary-button" onClick={restartSession}>같은 세트 다시 풀기</button>
              </div>
            </section>
          )}

          {!loading && !loadError && !showSessionResult && question && (
            <article className="question-card">
              <div className="question-meta">
                <div className="number-badge">Q{String(currentPosition + 1).padStart(3, "0")}</div>
                <span className="subject-label">{question.subject}</span>
                <span className="origin-label">{question.examLabel} · {question.number}번</span>
                {question.labels.map((label) => <span className="type-label" key={label}>{label}</span>)}
                <button className={`bookmark ${bookmarks.includes(question.id) ? "active" : ""}`} onClick={toggleBookmark} aria-pressed={bookmarks.includes(question.id)}>{bookmarks.includes(question.id) ? "저장됨" : "저장"}</button>
              </div>

              <h2>{question.text}</h2>
              {question.visuals.length > 0 && <div className="question-visuals" aria-label="문제에 포함된 표 또는 수식">{question.visuals.map((visual, index) => <img key={visual} src={visual} alt={`${question.number}번 문제 자료 ${index + 1}`} loading="lazy" />)}</div>}

              <div className="choices" role="radiogroup" aria-label="답안 선택">
                {question.choices.map((choice, index) => {
                  const isSelected = selected === index;
                  const isAnswer = isChecked && question.answer === index;
                  const isWrong = isChecked && isSelected && question.answer !== index;
                  return (
                    <button key={`${question.id}-${index}`} className={`choice ${isSelected ? "selected" : ""} ${isAnswer ? "answer" : ""} ${isWrong ? "incorrect" : ""}`} onClick={() => !isChecked && chooseAnswer(question, index)} role="radio" aria-checked={isSelected}>
                      <span className="choice-mark">{choiceMarks[index]}</span><span>{choice}</span>
                      {isAnswer && <b className="result-mark">정답</b>}{isWrong && <b className="result-mark">선택</b>}
                    </button>
                  );
                })}
              </div>

              {isChecked && (
                <section className={`explanation ${selected === question.answer ? "is-correct" : "is-wrong"}`} aria-live="polite">
                  <div className="explanation-title">
                    <span>{selected === question.answer ? "정답입니다" : `정답은 ${choiceMarks[question.answer]}입니다`}</span>
                    {detailedExplanation && (
                      <small className={explanationReview === "reviewed" ? "reviewed" : ""}>
                        {explanationReview === "reviewed"
                          ? "검수 완료 해설"
                          : explanationReview === "machine_checked"
                            ? "자동 점검 해설"
                            : "자체 제작 AI 해설 · 정답표 기준 · 오류 제보 가능"}
                      </small>
                    )}
                  </div>
                  {explanationStates[question.id] === "loading" && (
                    <div className="explanation-loading"><i />저장된 상세 해설을 불러오고 있습니다…</div>
                  )}
                  {explanationStates[question.id] === "missing" && (
                    <div className="explanation-error">
                      <span>이 문제의 상세 해설은 준비 중입니다.</span>
                    </div>
                  )}
                  {explanationStates[question.id] === "error" && (
                    <div className="explanation-error">
                      <span>상세 해설을 불러오지 못했습니다.</span>
                      <button onClick={() => void loadDetailedExplanation(question.id)}>다시 시도</button>
                    </div>
                  )}
                  {detailedExplanation && (
                    <div className="detailed-explanation">
                      <p className="explanation-summary">{detailedExplanation.summary}</p>
                      <div className="explanation-block">
                        <b>정답 근거</b>
                        <p>{detailedExplanation.correctReason}</p>
                      </div>
                      {detailedExplanation.calculation && (
                        <div className="explanation-block calculation-block">
                          <b>계산 과정</b>
                          <p>{detailedExplanation.calculation}</p>
                        </div>
                      )}
                      {detailedExplanation.examNote && (
                        <p className="exam-note"><b>참고</b>{detailedExplanation.examNote}</p>
                      )}
                    </div>
                  )}
                  {freshness && (
                    <p className="freshness-note">
                      <b>시행 당시 기준 / 현행 기준 대비 미확인</b>
                      <span>{freshness.note}</span>
                      {freshness.currentStandard && (
                        <a href={freshness.currentStandard.url} target="_blank" rel="noreferrer">
                          {freshness.currentStandard.name} ({freshness.currentStandard.ref}) 확인하기
                        </a>
                      )}
                    </p>
                  )}
                  <div className="key-point"><b>키워드(자동 분류)</b><span>{question.keyPoint}</span></div>
                  <div className="report-area">
                    {initialUser ? (
                      <button className="report-toggle" onClick={toggleReportForm} aria-expanded={reportOpenId === question.id}>
                        {reportOpenId === question.id ? "제보 닫기" : "이 문제 오류 제보"}
                      </button>
                    ) : (
                      <Link className="report-login" href="/auth/sign-in">로그인하고 오류 제보</Link>
                    )}
                    {initialUser && reportOpenId === question.id && (
                      <form className="report-form" onSubmit={(event) => void submitReport(event)}>
                        <label>
                          <span>오류 유형</span>
                          <select value={reportCategory} onChange={(event) => setReportCategory(event.target.value as ReportCategory)}>
                            <option value="answer">정답 오류</option>
                            <option value="explanation">해설 오류</option>
                            <option value="question">문제·선택지 오타</option>
                            <option value="source">이미지·원문 오류</option>
                          </select>
                        </label>
                        <label>
                          <span>어떤 부분이 잘못됐나요?</span>
                          <textarea
                            value={reportDetails}
                            onChange={(event) => {
                              setReportDetails(event.target.value);
                              if (reportState !== "idle") setReportState("idle");
                            }}
                            minLength={10}
                            maxLength={1000}
                            placeholder="예: 계산식에서 함수율을 건량 기준으로 적용해야 합니다."
                            required
                          />
                        </label>
                        <div className="report-form-footer">
                          <small>{reportDetails.length}/1000</small>
                          <button type="submit" disabled={reportState === "saving" || reportDetails.trim().length < 10}>
                            {reportState === "saving" ? "접수 중…" : "제보 보내기"}
                          </button>
                        </div>
                        {reportState === "sent" && <p className="report-message success">제보가 접수되었습니다. 같은 문항을 다시 보내면 내용이 갱신됩니다.</p>}
                        {reportState === "error" && <p className="report-message error">제보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.</p>}
                      </form>
                    )}
                  </div>
                </section>
              )}

              <div className="card-actions">
                <button className="secondary-button" onClick={() => move(-1)} disabled={currentPosition <= 0}>이전 문제</button>
                {isMock && !mockSubmitted ? (
                  <>
                    <button className="secondary-button next-button" onClick={() => move(1)} disabled={currentPosition === visibleQuestions.length - 1}>다음 문제</button>
                    <button className="primary-button" onClick={submitMockExam}>답안 제출 {answeredInSession}/{questions.length}</button>
                  </>
                ) : (
                  <button className="primary-button" onClick={() => move(1)} disabled={!isChecked || currentPosition === visibleQuestions.length - 1}>다음 문제</button>
                )}
              </div>
            </article>
          )}

          <p className="source-note">모의고사는 필기 5과목에서 각각 20문제씩, 여러 회차를 섞어 구성합니다. 법규·수치는 출제 당시 기준입니다.</p>
        </section>

        <aside className={`right-rail ${showPanel ? "show" : ""}`} aria-label="학습 현황">
          <button className="panel-close" onClick={() => setShowPanel(false)} aria-label="학습 현황 닫기">닫기</button>
          <div className="account-card">
            {initialUser ? (
              <>
                <span>로그인됨</span>
                <b>{initialUser.displayName}</b>
                <small className={syncState === "error" ? "sync-error" : ""}>{syncLabel}</small>
                {syncState === "error" && (
                  <button className="sync-retry" onClick={retrySync}>동기화 다시 시도</button>
                )}
                <button className="account-link" onClick={() => void signOut()}>로그아웃</button>
              </>

            ) : (
              <><span>게스트 학습</span><b>오답은 이 기기에만 저장됩니다</b><Link href="/auth/sign-in">로그인하고 동기화</Link></>
            )}
          </div>

          <div className="rail-divider" />
          <div className="eyebrow">현재 세트 학습</div>
          <div className="score-ring" style={{ "--score": `${statusPercent * 3.6}deg` } as React.CSSProperties}><div><strong>{statusPercent}</strong><span>%</span><small>{sessionScore.complete ? "정답률" : isMock && !mockSubmitted ? "답안 작성" : "진행률"}</small></div></div>
          <div className="score-stats"><div><span>정답</span><b className="blue">{correctCount}</b></div><div><span>세트 오답</span><b className="red">{wrongInSession.length}</b></div><div><span>저장</span><b>{bookmarksInSession.length}</b></div></div>

          {isMock && !mockSubmitted && <button className="mock-submit" onClick={submitMockExam}>모의고사 답안 제출 <b>{answeredInSession}/{questions.length}</b></button>}

          <div className="rail-divider" />
          <div className="eyebrow">빠른 복습</div>
          <button className={`review-button ${reviewMode === "all" ? "active" : ""}`} onClick={() => changeReviewMode("all")}><span>현재 문제 세트</span><b>{questions.length}</b></button>
          <button className={`review-button retry ${sourceMode === "wrong" ? "active" : ""}`} onClick={enterWrongSession} disabled={loading || (!wrongIds.length && !savedGeneratedSessions.wrong)}><span>틀린 문제 다시 풀기</span><b>{wrongIds.length || savedGeneratedSessions.wrong?.questions.length || 0}</b></button>
          <button className={`review-button ${reviewMode === "bookmark" ? "active" : ""}`} onClick={() => changeReviewMode("bookmark")} disabled={!bookmarksInSession.length}><span>저장한 문제</span><b>{bookmarksInSession.length}</b></button>

          <div className="notice-card"><b>필기 과목 구성</b><p>1~5과목에서 각각 20문제씩 출제됩니다. 세부 유형 라벨은 과목별 추가 연습에 사용합니다.</p></div>
        </aside>
          </>
        )}
      </main>

      {!showLearningHome && !showSessionResult && !loading && !loadError && question && (
        <nav className="mobile-quiz-actions" aria-label="문제 풀이 이동">
          <button className="mobile-action-secondary" onClick={() => move(-1)} disabled={currentPosition <= 0}>이전</button>
          <button className="mobile-question-index" onClick={() => setShowQuestionSheet(true)} aria-haspopup="dialog">
            <strong>{currentPosition + 1} / {visibleQuestions.length}</strong>
            <span>문제 목록</span>
          </button>
          {isMock && !mockSubmitted ? (
            currentPosition === visibleQuestions.length - 1 ? (
              <button className="mobile-action-primary" onClick={submitMockExam}>답안 제출</button>
            ) : (
              <button className="mobile-action-primary" onClick={() => move(1)}>다음</button>
            )
          ) : (
            <button className="mobile-action-primary" onClick={() => move(1)} disabled={!isChecked || currentPosition === visibleQuestions.length - 1}>다음</button>
          )}
        </nav>
      )}

      {showQuestionSheet && !showLearningHome && (
        <div className="question-sheet-backdrop" role="presentation" onClick={() => setShowQuestionSheet(false)}>
          <section className="question-sheet" role="dialog" aria-modal="true" aria-labelledby="question-sheet-title" onClick={(event) => event.stopPropagation()}>
            <div className="question-sheet-header">
              <div><span>현재 세트</span><h2 id="question-sheet-title">문제 목록</h2></div>
              <button autoFocus onClick={() => setShowQuestionSheet(false)} aria-label="문제 목록 닫기">닫기</button>
            </div>
            <div className="question-sheet-summary">
              <span>진행 {completedCount}/{questions.length}</span>
              <span>오답 {wrongInSession.length}</span>
              <span>저장 {bookmarksInSession.length}</span>
            </div>
            <div className="question-sheet-grid">
              {visibleQuestions.map((item, index) => {
                const answered = isMock && !mockSubmitted ? answers[item.id] !== undefined : checked.includes(item.id);
                const correct = checked.includes(item.id) && answers[item.id] === item.answer;
                return (
                  <button
                    key={item.id}
                    className={`question-dot ${question.id === item.id ? "current" : ""} ${answered && checked.includes(item.id) ? (correct ? "correct" : "wrong") : answered ? "answered" : ""}`}
                    onClick={() => openQuestionFromSheet(item.id)}
                    aria-label={`${index + 1}번 문제로 이동`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
            <div className="legend question-sheet-legend">
              <span><i className="legend-dot correct" /> 정답</span>
              <span><i className="legend-dot wrong" /> 오답</span>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
