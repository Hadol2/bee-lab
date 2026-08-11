"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
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

type StudyMode = "all" | "wrong" | "bookmark";

const exams = manifestData as ExamSummary[];
const choiceMarks = ["①", "②", "③", "④"];
const storageKey = "waste-cbt-progress-v2";

function includesLabel(question: Question, label: string) {
  return label === "전체 유형" || question.subject === label || question.labels.includes(label);
}

export default function QuizApp() {
  const [selectedExam, setSelectedExam] = useState(exams[0].date);
  const [exam, setExam] = useState<ExamData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [currentId, setCurrentId] = useState("");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState<string[]>([]);
  const [wrongIds, setWrongIds] = useState<string[]>([]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [reviewIds, setReviewIds] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [showPanel, setShowPanel] = useState(false);
  const [mode, setMode] = useState<StudyMode>("all");
  const [selectedLabel, setSelectedLabel] = useState("전체 유형");
  const [hydrated, setHydrated] = useState(false);

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
    const controller = new AbortController();
    const summary = exams.find((item) => item.date === selectedExam) ?? exams[0];
    fetch(summary.dataUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("exam load failed");
        return response.json() as Promise<ExamData>;
      })
      .then((data) => {
        setExam(data);
        setCurrentId(data.questions[0]?.id ?? "");
      })
      .catch((error) => {
        if (error instanceof Error && error.name !== "AbortError") setLoadError(true);
      });
    return () => controller.abort();
  }, [selectedExam]);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const questions = useMemo(() => exam?.questions ?? [], [exam]);
  const labelOptions = useMemo(() => {
    const labels = new Set<string>();
    questions.forEach((question) => {
      labels.add(question.subject);
      question.labels.forEach((label) => labels.add(label));
    });
    return ["전체 유형", ...labels];
  }, [questions]);

  const visibleQuestions = useMemo(() => {
    return questions.filter((question) => {
      if (!includesLabel(question, selectedLabel)) return false;
      if (mode === "bookmark") return bookmarks.includes(question.id);
      if (mode === "wrong") return reviewIds.includes(question.id);
      return true;
    });
  }, [questions, selectedLabel, mode, bookmarks, reviewIds]);

  useEffect(() => {
    if (visibleQuestions.length && !visibleQuestions.some((question) => question.id === currentId)) {
      // Keep navigation anchored when a filter removes the current question.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentId(visibleQuestions[0].id);
    }
  }, [visibleQuestions, currentId]);

  const question =
    questions.find((item) => item.id === currentId) ?? visibleQuestions[0] ?? questions[0];
  const currentPosition = question
    ? visibleQuestions.findIndex((item) => item.id === question.id)
    : -1;
  const selected = question ? answers[question.id] : undefined;
  const isChecked = question ? checked.includes(question.id) : false;
  const examIds = useMemo(() => new Set(questions.map((item) => item.id)), [questions]);
  const checkedInExam = checked.filter((id) => examIds.has(id));
  const correctCount = checkedInExam.filter((id) => {
    const item = questions.find((candidate) => candidate.id === id);
    return item && answers[id] === item.answer;
  }).length;
  const wrongInExam = wrongIds.filter((id) => examIds.has(id));
  const bookmarksInExam = bookmarks.filter((id) => examIds.has(id));
  const progress = questions.length
    ? Math.round((checkedInExam.length / questions.length) * 100)
    : 0;
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const seconds = String(elapsed % 60).padStart(2, "0");

  function selectExam(date: string) {
    setExam(null);
    setLoadError(false);
    setSelectedExam(date);
    setMode("all");
    setReviewIds([]);
    setSelectedLabel("전체 유형");
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

  function changeMode(nextMode: Exclude<StudyMode, "wrong">) {
    setMode(nextMode);
    setReviewIds([]);
    const candidates = questions.filter((item) => {
      if (!includesLabel(item, selectedLabel)) return false;
      return nextMode === "bookmark" ? bookmarks.includes(item.id) : true;
    });
    if (candidates.length) setCurrentId(candidates[0].id);
  }

  function startWrongRetry() {
    const ids = questions.filter((item) => wrongIds.includes(item.id)).map((item) => item.id);
    if (!ids.length) return;
    const retrySet = new Set(ids);
    setAnswers((items) =>
      Object.fromEntries(Object.entries(items).filter(([id]) => !retrySet.has(id))),
    );
    setChecked((items) => items.filter((id) => !retrySet.has(id)));
    setReviewIds(ids);
    setSelectedLabel("전체 유형");
    setMode("wrong");
    setCurrentId(ids[0]);
    setShowPanel(false);
  }

  function checkAnswer() {
    if (!question || selected === undefined) return;
    setChecked((items) => (items.includes(question.id) ? items : [...items, question.id]));
    setWrongIds((items) => {
      if (selected === question.answer) return items.filter((id) => id !== question.id);
      return items.includes(question.id) ? items : [...items, question.id];
    });
  }

  function toggleBookmark() {
    if (!question) return;
    setBookmarks((items) =>
      items.includes(question.id)
        ? items.filter((id) => id !== question.id)
        : [...items, question.id],
    );
  }

  const currentSummary = exams.find((item) => item.date === selectedExam) ?? exams[0];

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="폐기물기사 LAB 홈">
          <span className="brand-mark">W</span>
          <span>폐기물기사 <b>LAB</b></span>
        </a>
        <div className="top-actions">
          <span className="library-count">22회차 · 2,200문제</span>
          <span className="save-state"><i /> 자동 저장됨</span>
          <button className="icon-button" onClick={() => setShowPanel(!showPanel)} aria-label="학습 현황 열기">
            {progress}%
          </button>
        </div>
      </header>

      <main className="workspace" id="top">
        <aside className="left-rail" aria-label="회차 및 문제 목록">
          <div className="eyebrow">기출 회차</div>
          <div className="exam-list">
            {exams.map((item) => (
              <button
                className={`exam-item ${item.date === selectedExam ? "active" : ""}`}
                key={item.date}
                onClick={() => selectExam(item.date)}
              >
                <span>{item.label}</span>
                <small>{item.count}문제</small>
              </button>
            ))}
          </div>

          <div className="rail-divider" />
          <div className="eyebrow row-between"><span>문제</span><span>{checkedInExam.length}/{questions.length || 100}</span></div>
          <div className="question-grid">
            {visibleQuestions.map((item) => {
              const answered = checked.includes(item.id);
              const correct = answered && answers[item.id] === item.answer;
              return (
                <button
                  key={item.id}
                  className={`question-dot ${question?.id === item.id ? "current" : ""} ${answered ? (correct ? "correct" : "wrong") : ""}`}
                  onClick={() => setCurrentId(item.id)}
                  aria-label={`${item.number}번 문제`}
                >
                  {item.number}
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
              <div className="crumb">폐기물처리기사 · {currentSummary.label}</div>
              <h1>기출문제 집중 학습</h1>
            </div>
            <div className="timer" aria-label={`학습 시간 ${minutes}분 ${seconds}초`}>
              <span className="timer-dot" />
              <b>{minutes}:{seconds}</b>
            </div>
          </div>

          <div className="study-filters">
            <label>
              <span>회차</span>
              <select value={selectedExam} onChange={(event) => selectExam(event.target.value)}>
                {exams.map((item) => <option key={item.date} value={item.date}>{item.label}</option>)}
              </select>
            </label>
            <label>
              <span>과목·유형</span>
              <select value={selectedLabel} onChange={(event) => setSelectedLabel(event.target.value)}>
                {labelOptions.map((label) => <option key={label}>{label}</option>)}
              </select>
            </label>
            {mode !== "all" && (
              <button className="mode-chip" onClick={() => changeMode("all")}>
                {mode === "wrong" ? "오답 재도전 중" : "저장 문제 보는 중"} ×
              </button>
            )}
          </div>

          <div className="progress-track"><span style={{ width: `${question ? question.number : 0}%` }} /></div>

          {!exam && !loadError && <div className="loading-card">회차 문제를 불러오는 중입니다…</div>}
          {loadError && <div className="loading-card error">문제를 불러오지 못했습니다. 새로고침해 주세요.</div>}
          {exam && !visibleQuestions.length && (
            <div className="loading-card">이 조건에 맞는 문제가 없습니다.</div>
          )}

          {exam && question && visibleQuestions.length > 0 && (
            <article className="question-card">
              <div className="question-meta">
                <div className="number-badge">Q{String(question.number).padStart(3, "0")}</div>
                <span className="subject-label">{question.subject}</span>
                {question.labels.map((label) => <span className="type-label" key={label}>{label}</span>)}
                <button
                  className={`bookmark ${bookmarks.includes(question.id) ? "active" : ""}`}
                  onClick={toggleBookmark}
                  aria-pressed={bookmarks.includes(question.id)}
                >
                  {bookmarks.includes(question.id) ? "저장됨" : "저장"}
                </button>
              </div>

              <h2>{question.text}</h2>

              {question.visuals.length > 0 && (
                <div className="question-visuals" aria-label="문제에 포함된 표 또는 수식">
                  {question.visuals.map((visual, index) => (
                    <img key={visual} src={visual} alt={`${question.number}번 문제 자료 ${index + 1}`} loading="lazy" />
                  ))}
                </div>
              )}

              <div className="choices" role="radiogroup" aria-label="답안 선택">
                {question.choices.map((choice, index) => {
                  const isSelected = selected === index;
                  const isAnswer = isChecked && question.answer === index;
                  const isWrong = isChecked && isSelected && question.answer !== index;
                  return (
                    <button
                      key={`${question.id}-${index}`}
                      className={`choice ${isSelected ? "selected" : ""} ${isAnswer ? "answer" : ""} ${isWrong ? "incorrect" : ""}`}
                      onClick={() => !isChecked && setAnswers((items) => ({ ...items, [question.id]: index }))}
                      role="radio"
                      aria-checked={isSelected}
                    >
                      <span className="choice-mark">{choiceMarks[index]}</span>
                      <span>{choice}</span>
                      {isAnswer && <b className="result-mark">정답</b>}
                      {isWrong && <b className="result-mark">선택</b>}
                    </button>
                  );
                })}
              </div>

              {isChecked && (
                <section className={`explanation ${selected === question.answer ? "is-correct" : "is-wrong"}`} aria-live="polite">
                  <div className="explanation-title">
                    <span>{selected === question.answer ? "정답입니다" : `정답은 ${choiceMarks[question.answer]}입니다`}</span>
                    <small>정답표 기준 풀이 가이드</small>
                  </div>
                  <p>{question.explanation}</p>
                  <div className="key-point"><b>TYPE</b><span>{question.keyPoint}</span></div>
                  <div className="source-links">
                    <a href={`${exam.studentPdf}#page=${question.sourcePage}`} target="_blank" rel="noreferrer">학생용 원문 {question.sourcePage}쪽</a>
                    <a href={`${exam.teacherPdf}#page=${question.sourcePage}`} target="_blank" rel="noreferrer">정답 표시 원문</a>
                  </div>
                </section>
              )}

              <div className="card-actions">
                <button className="secondary-button" onClick={() => move(-1)} disabled={currentPosition <= 0}>이전 문제</button>
                {!isChecked ? (
                  <button className="primary-button" onClick={checkAnswer} disabled={selected === undefined}>정답 확인</button>
                ) : (
                  <button className="primary-button" onClick={() => move(1)} disabled={currentPosition === visibleQuestions.length - 1}>다음 문제</button>
                )}
              </div>
            </article>
          )}

          <p className="source-note">
            저장된 2015~2022년 기출 PDF 44개를 회차별로 구성했습니다. 법규·수치는 출제 당시 기준입니다.
            <a href={currentSummary.studentPdf} target="_blank" rel="noreferrer">이 회차 학생용 PDF</a>
          </p>
        </section>

        <aside className={`right-rail ${showPanel ? "show" : ""}`} aria-label="학습 현황">
          <button className="panel-close" onClick={() => setShowPanel(false)} aria-label="학습 현황 닫기">닫기</button>
          <div className="eyebrow">현재 회차 학습</div>
          <div className="score-ring" style={{ "--score": `${progress * 3.6}deg` } as React.CSSProperties}>
            <div><strong>{progress}</strong><span>%</span><small>진행률</small></div>
          </div>
          <div className="score-stats">
            <div><span>정답</span><b className="blue">{correctCount}</b></div>
            <div><span>오답</span><b className="red">{wrongInExam.length}</b></div>
            <div><span>저장</span><b>{bookmarksInExam.length}</b></div>
          </div>

          <div className="rail-divider" />
          <div className="eyebrow">빠른 복습</div>
          <button className={`review-button ${mode === "all" ? "active" : ""}`} onClick={() => changeMode("all")}>
            <span>전체 문제</span><b>{questions.length || 100}</b>
          </button>
          <button className={`review-button retry ${mode === "wrong" ? "active" : ""}`} onClick={startWrongRetry} disabled={!wrongInExam.length}>
            <span>틀린 문제 다시 풀기</span><b>{wrongInExam.length}</b>
          </button>
          <button className={`review-button ${mode === "bookmark" ? "active" : ""}`} onClick={() => changeMode("bookmark")} disabled={!bookmarksInExam.length}>
            <span>저장한 문제</span><b>{bookmarksInExam.length}</b>
          </button>

          <div className="notice-card">
            <b>원문 PDF</b>
            <p>교사용·학생용 PDF가 모두 저장되어 있습니다. 표나 수식은 문제 채점 뒤 원문 페이지에서 확인할 수 있습니다.</p>
            <div className="pdf-buttons">
              <a href={currentSummary.studentPdf} target="_blank" rel="noreferrer">학생용</a>
              <a href={currentSummary.teacherPdf} target="_blank" rel="noreferrer">교사용</a>
            </div>
          </div>
        </aside>
      </main>

      <nav className="mobile-nav" aria-label="모바일 메뉴">
        <button onClick={() => changeMode("all")} className={mode === "all" ? "active" : ""}><span>100</span>문제풀이</button>
        <button onClick={startWrongRetry} className={mode === "wrong" ? "active" : ""} disabled={!wrongInExam.length}><span>{wrongInExam.length}</span>오답 재도전</button>
        <button onClick={() => setShowPanel(true)}><span>{progress}%</span>학습현황</button>
      </nav>
    </div>
  );
}
