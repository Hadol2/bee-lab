"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import {
  OFFICIAL_SUBJECTS,
  createMockExam,
  createSubjectSet,
  type OfficialSubject,
} from "../lib/question-sets";
import manifestData from "../public/data/exams/manifest.json";

type Question = {
  id: string;
  number: number;
  subject: string;
  labels: string[];
  text: string;
  choices: string[];
  answer: number;
  explanation: string;
  keyPoint: string;
  sourcePage: number;
  visuals: string[];
};

type ExamSummary = {
  date: string;
  label: string;
  count: number;
  dataUrl: string;
  studentPdf: string;
  teacherPdf: string;
};

type ExamData = Omit<ExamSummary, "count" | "dataUrl"> & {
  questions: Question[];
};

type RuntimeQuestion = Question & {
  examDate: string;
  examLabel: string;
  studentPdf: string;
  teacherPdf: string;
};

type SourceMode = "exam" | "subject" | "mock" | "wrong";
type ReviewMode = "all" | "bookmark";
type SyncState = "local" | "loading" | "synced" | "saving" | "error";

const exams = manifestData as ExamSummary[];
const choiceMarks = ["①", "②", "③", "④"];
const storageKey = "waste-cbt-progress-v2";
const syncedAppUrl = "https://waste-engineer-lab.jhs9918515606.chatgpt.site/";
let libraryPromise: Promise<RuntimeQuestion[]> | null = null;

function withExam(question: Question, exam: ExamData): RuntimeQuestion {
  return {
    ...question,
    examDate: exam.date,
    examLabel: exam.label,
    studentPdf: exam.studentPdf,
    teacherPdf: exam.teacherPdf,
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

export default function QuizApp({
  initialUser,
}: {
  initialUser: { displayName: string } | null;
}) {
  const [sourceMode, setSourceMode] = useState<SourceMode>("exam");
  const [selectedExam, setSelectedExam] = useState(exams[0].date);
  const [selectedSubject, setSelectedSubject] = useState<OfficialSubject>(OFFICIAL_SUBJECTS[0]);
  const [questions, setQuestions] = useState<RuntimeQuestion[]>([]);
  const [sessionLabel, setSessionLabel] = useState(exams[0].label);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [currentId, setCurrentId] = useState("");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState<string[]>([]);
  const [wrongIds, setWrongIds] = useState<string[]>([]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [showPanel, setShowPanel] = useState(false);
  const [reviewMode, setReviewMode] = useState<ReviewMode>("all");
  const [selectedLabel, setSelectedLabel] = useState("전체 유형");
  const [mockSubmitted, setMockSubmitted] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [syncReady, setSyncReady] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>(initialUser ? "loading" : "local");

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
      JSON.stringify({ answers, checked, wrongIds, bookmarks }),
    );
  }, [answers, checked, wrongIds, bookmarks, hydrated]);

  useEffect(() => {
    if (!hydrated || !initialUser) return;
    let active = true;
    fetch("/api/progress")
      .then((response) => {
        if (!response.ok) throw new Error("sync unavailable");
        return response.json() as Promise<{ wrongIds: string[] }>;
      })
      .then((remote) => {
        if (!active) return;
        setWrongIds((local) => [...new Set([...local, ...remote.wrongIds])]);
        setSyncReady(true);
        setSyncState("synced");
      })
      .catch(() => {
        if (active) setSyncState("error");
      });
    return () => {
      active = false;
    };
  }, [hydrated, initialUser]);

  useEffect(() => {
    if (!syncReady || !initialUser) return;
    const timer = window.setTimeout(() => {
      setSyncState("saving");
      fetch("/api/progress", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wrongIds }),
      })
        .then((response) => {
          if (!response.ok) throw new Error("sync failed");
          setSyncState("synced");
        })
        .catch(() => setSyncState("error"));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [wrongIds, syncReady, initialUser]);

  useEffect(() => {
    if (sourceMode !== "exam") return;
    let active = true;
    const summary = exams.find((item) => item.date === selectedExam) ?? exams[0];
    fetchExam(summary)
      .then((exam) => {
        if (!active) return;
        const next = exam.questions.map((question) => withExam(question, exam));
        setQuestions(next);
        setSessionLabel(exam.label);
        setCurrentId(next[0]?.id ?? "");
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
  }, [selectedExam, sourceMode]);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

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
  const isMock = sourceMode === "mock";
  const isChecked = question
    ? isMock
      ? mockSubmitted
      : checked.includes(question.id)
    : false;
  const sessionIds = useMemo(() => new Set(questions.map((item) => item.id)), [questions]);
  const answeredInSession = questions.filter((item) => answers[item.id] !== undefined).length;
  const checkedInSession = checked.filter((id) => sessionIds.has(id));
  const correctCount = checkedInSession.filter((id) => {
    const item = questions.find((candidate) => candidate.id === id);
    return item && answers[id] === item.answer;
  }).length;
  const wrongInSession = wrongIds.filter((id) => sessionIds.has(id));
  const bookmarksInSession = bookmarks.filter((id) => sessionIds.has(id));
  const completedCount = isMock && !mockSubmitted ? answeredInSession : checkedInSession.length;
  const progress = questions.length ? Math.round((completedCount / questions.length) * 100) : 0;
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const seconds = String(elapsed % 60).padStart(2, "0");
  const syncLabel = {
    local: "이 기기에 저장",
    loading: "오답 불러오는 중",
    synced: "오답 동기화됨",
    saving: "오답 저장 중",
    error: "동기화 재시도 필요",
  }[syncState];

  function resetAttempt(next: RuntimeQuestion[]) {
    const ids = new Set(next.map((item) => item.id));
    setAnswers((items) =>
      Object.fromEntries(Object.entries(items).filter(([id]) => !ids.has(id))),
    );
    setChecked((items) => items.filter((id) => !ids.has(id)));
    setCurrentId(next[0]?.id ?? "");
    setReviewMode("all");
    setSelectedLabel("전체 유형");
    setMockSubmitted(false);
    setElapsed(0);
  }

  function selectExam(date: string) {
    setLoading(true);
    setLoadError(false);
    setSourceMode("exam");
    setSelectedExam(date);
    setReviewMode("all");
    setSelectedLabel("전체 유형");
    setMockSubmitted(false);
  }

  async function startSubject(subject = selectedSubject) {
    setLoading(true);
    setLoadError(false);
    setSelectedSubject(subject);
    try {
      const next = createSubjectSet(await loadLibrary(), subject, 20);
      setQuestions(next);
      setSessionLabel(`${subject} · 무작위 20문제`);
      setSourceMode("subject");
      resetAttempt(next);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  async function startMockExam() {
    setLoading(true);
    setLoadError(false);
    try {
      const next = createMockExam(await loadLibrary());
      setQuestions(next);
      setSessionLabel("실전 모의고사 · 5과목 × 20문제");
      setSourceMode("mock");
      resetAttempt(next);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  async function startWrongRetry() {
    if (!wrongIds.length) return;
    setLoading(true);
    setLoadError(false);
    try {
      const wrongSet = new Set(wrongIds);
      const next = (await loadLibrary()).filter((item) => wrongSet.has(item.id));
      setQuestions(next);
      setSessionLabel(`내 오답 · ${next.length}문제`);
      setSourceMode("wrong");
      resetAttempt(next);
      setShowPanel(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  function changeSource(value: SourceMode) {
    if (value === "exam") selectExam(selectedExam);
    if (value === "subject") void startSubject();
    if (value === "mock") void startMockExam();
    if (value === "wrong") void startWrongRetry();
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

  function checkAnswer() {
    if (!question || selected === undefined) return;
    setChecked((items) => (items.includes(question.id) ? items : [...items, question.id]));
    setWrongIds((items) => {
      if (selected === question.answer) return items.filter((id) => id !== question.id);
      return items.includes(question.id) ? items : [...items, question.id];
    });
  }

  function submitMockExam() {
    if (!window.confirm(`${answeredInSession}/100문제에 답했습니다. 답안을 제출할까요?`)) return;
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
  }

  function toggleBookmark() {
    if (!question) return;
    setBookmarks((items) =>
      items.includes(question.id)
        ? items.filter((id) => id !== question.id)
        : [...items, question.id],
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="폐기물기사 LAB 홈">
          <span className="brand-mark">W</span>
          <span>폐기물기사 <b>LAB</b></span>
        </a>
        <div className="top-actions">
          <span className="library-count">5과목 · 2,200문제</span>
          <span className="save-state"><i /> {syncLabel}</span>
          {initialUser ? (
            <button className="account-button" onClick={() => setShowPanel(true)}>{initialUser.displayName.slice(0, 8)}</button>
          ) : (
            <a className="login-button" href={syncedAppUrl}>로그인</a>
          )}
          <button className="icon-button" onClick={() => setShowPanel(!showPanel)} aria-label="학습 현황 열기">
            {progress}%
          </button>
        </div>
      </header>

      <main className="workspace" id="top">
        <aside className="left-rail" aria-label="학습 방식 및 문제 목록">
          <div className="eyebrow">학습 방식</div>
          <div className="source-list">
            <button className={sourceMode === "exam" ? "active" : ""} onClick={() => selectExam(selectedExam)}><span>회차별 풀이</span><small>100문제</small></button>
            <button className={sourceMode === "subject" ? "active" : ""} onClick={() => void startSubject()}><span>과목별 풀이</span><small>20문제</small></button>
            <button className={sourceMode === "mock" ? "active" : ""} onClick={() => void startMockExam()}><span>실전 모의고사</span><small>5×20</small></button>
            <button className={sourceMode === "wrong" ? "active" : ""} onClick={() => void startWrongRetry()} disabled={!wrongIds.length}><span>내 오답</span><small>{wrongIds.length}</small></button>
          </div>

          <div className="rail-divider" />
          {sourceMode === "exam" && (
            <>
              <div className="eyebrow">기출 회차</div>
              <div className="exam-list">
                {exams.map((item) => (
                  <button className={`exam-item ${item.date === selectedExam ? "active" : ""}`} key={item.date} onClick={() => selectExam(item.date)}>
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
                  <button className={subject === selectedSubject ? "active" : ""} key={subject} onClick={() => void startSubject(subject)}>
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
            <div className="timer" aria-label={`학습 시간 ${minutes}분 ${seconds}초`}>
              <span className="timer-dot" /><b>{minutes}:{seconds}</b>
            </div>
          </div>

          <div className="study-filters">
            <label>
              <span>학습 방식</span>
              <select value={sourceMode} onChange={(event) => changeSource(event.target.value as SourceMode)}>
                <option value="exam">회차별 풀이</option>
                <option value="subject">과목별 풀이</option>
                <option value="mock">실전 모의고사</option>
                <option value="wrong" disabled={!wrongIds.length}>내 오답</option>
              </select>
            </label>
            {sourceMode === "exam" && (
              <label><span>회차</span><select value={selectedExam} onChange={(event) => selectExam(event.target.value)}>{exams.map((item) => <option key={item.date} value={item.date}>{item.label}</option>)}</select></label>
            )}
            {sourceMode === "subject" && (
              <label><span>과목</span><select value={selectedSubject} onChange={(event) => void startSubject(event.target.value as OfficialSubject)}>{OFFICIAL_SUBJECTS.map((subject, index) => <option key={subject} value={subject}>{index + 1}과목 · {subject}</option>)}</select></label>
            )}
            {sourceMode === "mock" && <button className="set-button" onClick={() => void startMockExam()}>새 모의고사 구성</button>}
            {sourceMode === "wrong" && <button className="set-button" onClick={() => void startWrongRetry()}>오답 다시 섞기</button>}
            {!isMock && (
              <label><span>세부 유형</span><select value={selectedLabel} onChange={(event) => setSelectedLabel(event.target.value)}>{labelOptions.map((label) => <option key={label}>{label}</option>)}</select></label>
            )}
            {reviewMode === "bookmark" && <button className="mode-chip" onClick={() => changeReviewMode("all")}>저장 문제 보는 중 ×</button>}
          </div>

          <div className="progress-track"><span style={{ width: `${visibleQuestions.length ? ((currentPosition + 1) / visibleQuestions.length) * 100 : 0}%` }} /></div>

          {loading && <div className="loading-card">문제 세트를 구성하는 중입니다…</div>}
          {loadError && !loading && <div className="loading-card error">문제를 불러오지 못했습니다. 다시 시도해 주세요.</div>}
          {!loading && !loadError && !visibleQuestions.length && <div className="loading-card">이 조건에 맞는 문제가 없습니다.</div>}

          {!loading && !loadError && question && (
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
                    <button key={`${question.id}-${index}`} className={`choice ${isSelected ? "selected" : ""} ${isAnswer ? "answer" : ""} ${isWrong ? "incorrect" : ""}`} onClick={() => !isChecked && setAnswers((items) => ({ ...items, [question.id]: index }))} role="radio" aria-checked={isSelected}>
                      <span className="choice-mark">{choiceMarks[index]}</span><span>{choice}</span>
                      {isAnswer && <b className="result-mark">정답</b>}{isWrong && <b className="result-mark">선택</b>}
                    </button>
                  );
                })}
              </div>

              {isChecked && (
                <section className={`explanation ${selected === question.answer ? "is-correct" : "is-wrong"}`} aria-live="polite">
                  <div className="explanation-title"><span>{selected === question.answer ? "정답입니다" : `정답은 ${choiceMarks[question.answer]}입니다`}</span><small>정답표 기준 풀이 가이드</small></div>
                  <p>{question.explanation}</p>
                  <div className="key-point"><b>TYPE</b><span>{question.keyPoint}</span></div>
                  <div className="source-links"><a href={`${question.studentPdf}#page=${question.sourcePage}`} target="_blank" rel="noreferrer">학생용 원문 {question.sourcePage}쪽</a><a href={`${question.teacherPdf}#page=${question.sourcePage}`} target="_blank" rel="noreferrer">정답 표시 원문</a></div>
                </section>
              )}

              <div className="card-actions">
                <button className="secondary-button" onClick={() => move(-1)} disabled={currentPosition <= 0}>이전 문제</button>
                {isMock && !mockSubmitted ? (
                  <>
                    <button className="secondary-button next-button" onClick={() => move(1)} disabled={currentPosition === visibleQuestions.length - 1}>다음 문제</button>
                    <button className="primary-button" onClick={submitMockExam}>답안 제출 {answeredInSession}/100</button>
                  </>
                ) : !isChecked ? (
                  <button className="primary-button" onClick={checkAnswer} disabled={selected === undefined}>정답 확인</button>
                ) : (
                  <button className="primary-button" onClick={() => move(1)} disabled={currentPosition === visibleQuestions.length - 1}>다음 문제</button>
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
              <><span>로그인됨</span><b>{initialUser.displayName}</b><small className={syncState === "error" ? "sync-error" : ""}>{syncLabel}</small><a href="/signout-with-chatgpt?return_to=/">로그아웃</a></>
            ) : (
              <><span>게스트 학습</span><b>오답은 이 기기에만 저장됩니다</b><a href={syncedAppUrl}>ChatGPT로 로그인</a></>
            )}
          </div>

          <div className="rail-divider" />
          <div className="eyebrow">현재 세트 학습</div>
          <div className="score-ring" style={{ "--score": `${progress * 3.6}deg` } as React.CSSProperties}><div><strong>{progress}</strong><span>%</span><small>{isMock && !mockSubmitted ? "답안 작성" : "진행률"}</small></div></div>
          <div className="score-stats"><div><span>정답</span><b className="blue">{correctCount}</b></div><div><span>세트 오답</span><b className="red">{wrongInSession.length}</b></div><div><span>저장</span><b>{bookmarksInSession.length}</b></div></div>

          {isMock && !mockSubmitted && <button className="mock-submit" onClick={submitMockExam}>모의고사 답안 제출 <b>{answeredInSession}/100</b></button>}

          <div className="rail-divider" />
          <div className="eyebrow">빠른 복습</div>
          <button className={`review-button ${reviewMode === "all" ? "active" : ""}`} onClick={() => changeReviewMode("all")}><span>현재 문제 세트</span><b>{questions.length}</b></button>
          <button className={`review-button retry ${sourceMode === "wrong" ? "active" : ""}`} onClick={() => void startWrongRetry()} disabled={!wrongIds.length}><span>틀린 문제 다시 풀기</span><b>{wrongIds.length}</b></button>
          <button className={`review-button ${reviewMode === "bookmark" ? "active" : ""}`} onClick={() => changeReviewMode("bookmark")} disabled={!bookmarksInSession.length}><span>저장한 문제</span><b>{bookmarksInSession.length}</b></button>

          <div className="notice-card"><b>필기 과목 구성</b><p>1~5과목에서 각각 20문제씩 출제됩니다. 세부 유형 라벨은 과목별 추가 연습에 사용합니다.</p></div>
        </aside>
      </main>

      <nav className="mobile-nav" aria-label="모바일 메뉴">
        <button onClick={() => selectExam(selectedExam)} className={sourceMode === "exam" ? "active" : ""}><span>100</span>회차별</button>
        <button onClick={() => void startWrongRetry()} className={sourceMode === "wrong" ? "active" : ""} disabled={!wrongIds.length}><span>{wrongIds.length}</span>오답모음</button>
        <button onClick={() => setShowPanel(true)}><span>{progress}%</span>학습현황</button>
      </nav>
    </div>
  );
}
