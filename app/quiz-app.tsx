"use client";

import { useEffect, useMemo, useState } from "react";

type Question = {
  id: number;
  subject: string;
  text: string;
  choices: string[];
  answer: number;
  explanation: string;
  keyPoint: string;
};

const questions: Question[] = [
  {
    id: 1,
    subject: "폐기물 관계 법규",
    text: "지정폐기물인 부식성 폐기물을 판단하는 수소이온 농도 기준으로 옳은 것은?",
    choices: ["pH 1.0 이하", "pH 1.5 이하", "pH 2.0 이하", "pH 2.5 이하"],
    answer: 2,
    explanation:
      "폐기물공정시험기준상 액체 상태의 폐기물이 pH 2.0 이하인 경우 강산성 부식성 폐기물 기준에 해당합니다.",
    keyPoint: "강산성 pH 2.0 이하 · 강알칼리성 pH 12.5 이상",
  },
  {
    id: 2,
    subject: "폐기물 관계 법규",
    text: "관리형 매립시설에서 발생하는 침출수의 ‘나 지역’ BOD 배출허용기준은?",
    choices: ["60 mg/L 이하", "70 mg/L 이하", "80 mg/L 이하", "90 mg/L 이하"],
    answer: 1,
    explanation:
      "해당 회차의 시험 기준에서 ‘나 지역’ 생물화학적 산소요구량 기준은 70 mg/L 이하입니다. 지역 구분별 수치를 묶어 암기하는 문제입니다.",
    keyPoint: "나 지역 BOD 70 mg/L 이하",
  },
  {
    id: 3,
    subject: "폐기물 관계 법규",
    text: "폐기물의 재활용을 금지하거나 제한하는 대상이 아닌 것은?",
    choices: ["폐석면", "폴리클로리네이티드비페닐", "휘발성유기화합물", "의료폐기물"],
    answer: 2,
    explanation:
      "휘발성유기화합물(VOCs)은 물질군을 가리키는 표현으로, 이 보기들 가운데 폐기물 재활용 금지·제한 대상의 열거 항목과 직접 일치하지 않습니다.",
    keyPoint: "법규 문제는 조문에 열거된 폐기물 명칭을 정확히 구분",
  },
  {
    id: 4,
    subject: "폐기물 관계 법규",
    text: "지정폐기물 중 유해물질 함유 폐기물에 관한 설명으로 틀린 것은?",
    choices: ["일부 광재", "방지시설에서 포집된 일부 분진", "폐합성수지 전체", "일부 폐내화물"],
    answer: 2,
    explanation:
      "폐합성수지 전체가 곧바로 유해물질 함유 지정폐기물이 되는 것은 아닙니다. 함유 물질과 기준 농도 등 법정 요건을 함께 충족해야 합니다.",
    keyPoint: "폐기물 이름만이 아니라 유해물질 함유 기준까지 확인",
  },
  {
    id: 5,
    subject: "폐기물 관계 법규",
    text: "폐기물 시험·분석 전문기관으로 지정될 수 있는 기관에 해당하지 않는 것은?",
    choices: ["한국건설기술연구원", "한국환경공단", "수도권매립지관리공사", "보건환경연구원"],
    answer: 0,
    explanation:
      "해당 시험 회차의 법령 기준에서는 한국환경공단, 수도권매립지관리공사, 보건환경연구원 등이 대상이며 한국건설기술연구원은 열거 대상이 아닙니다.",
    keyPoint: "기관명 열거 문제는 유사 기관과 혼동하지 않기",
  },
  {
    id: 6,
    subject: "폐기물 처리기술",
    text: "기술관리인을 두어야 하는 멸균분쇄시설의 시간당 처분능력 기준은?",
    choices: ["100 kg 이상", "125 kg 이상", "200 kg 이상", "300 kg 이상"],
    answer: 0,
    explanation:
      "멸균분쇄시설은 시간당 처분능력이 100 kg 이상이면 기술관리인을 두어야 하는 시설 기준에 해당합니다.",
    keyPoint: "멸균분쇄시설 100 kg/시간 이상",
  },
  {
    id: 7,
    subject: "폐기물 관계 법규",
    text: "폐기물 관리의 기본원칙에 관한 설명으로 틀린 것은?",
    choices: [
      "처분보다 재활용을 우선한다.",
      "국내 발생 폐기물은 국내 처리해야 하며 수입은 전면 금지된다.",
      "배출 전 환경과 건강 위해를 막기 위한 조치를 한다.",
      "사업자는 발생 억제와 자체 재활용을 위해 노력한다.",
    ],
    answer: 1,
    explanation:
      "국내 발생 폐기물의 국내 처리 원칙은 맞지만, 폐기물 수입이 모든 경우에 전면 금지되는 것은 아닙니다. 허가·신고 등 별도의 관리 체계가 존재합니다.",
    keyPoint: "‘원칙’과 ‘전면 금지’를 구분",
  },
  {
    id: 8,
    subject: "폐기물 관계 법규",
    text: "폐기물 처리업자가 기록한 장부의 보존기간은 최종 기재일부터 얼마인가?",
    choices: ["6개월", "1년", "3년", "5년"],
    answer: 2,
    explanation:
      "폐기물 처리업 관련 장부는 최종 기재일을 기준으로 3년간 보존해야 합니다. 기산점이 ‘최종 기재일’이라는 점도 함께 기억합니다.",
    keyPoint: "장부 보존: 최종 기재일부터 3년",
  },
  {
    id: 9,
    subject: "폐기물 처리기술",
    text: "폐기물 처리시설의 종류와 시설 예시를 잘못 연결한 것은?",
    choices: [
      "기계적 재활용시설 — 유수 분리 시설",
      "화학적 재활용시설 — 연료화 시설",
      "생물학적 재활용시설 — 버섯재배시설",
      "생물학적 재활용시설 — 호기성·혐기성 분해시설",
    ],
    answer: 1,
    explanation:
      "연료화 시설은 화학적 재활용시설로 분류하지 않습니다. 처리 원리와 대표 시설을 연결해 두면 분류 문제를 빠르게 풀 수 있습니다.",
    keyPoint: "시설 명칭보다 실제 처리 원리로 분류",
  },
];

const examOptions = [
  { label: "2022년 2회", count: 9, active: true },
  { label: "2022년 1회", count: 0, active: false },
  { label: "2021년 4회", count: 0, active: false },
];

const choiceMarks = ["①", "②", "③", "④"];

export default function QuizApp() {
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState<number[]>([]);
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [showPanel, setShowPanel] = useState(false);
  const [mode, setMode] = useState<"all" | "wrong" | "bookmark">("all");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("waste-cbt-progress");
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setAnswers(data.answers ?? {});
        setChecked(data.checked ?? []);
        setBookmarks(data.bookmarks ?? []);
      } catch {
        window.localStorage.removeItem("waste-cbt-progress");
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      "waste-cbt-progress",
      JSON.stringify({ answers, checked, bookmarks }),
    );
  }, [answers, checked, bookmarks, hydrated]);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const filteredIndexes = useMemo(() => {
    if (mode === "bookmark") {
      return questions.map((_, index) => index).filter((index) => bookmarks.includes(index));
    }
    if (mode === "wrong") {
      return questions
        .map((question, index) => ({ question, index }))
        .filter(
          ({ question, index }) =>
            checked.includes(index) && answers[index] !== question.answer,
        )
        .map(({ index }) => index);
    }
    return questions.map((_, index) => index);
  }, [mode, answers, checked, bookmarks]);

  const question = questions[current];
  const isChecked = checked.includes(current);
  const selected = answers[current];
  const correctCount = checked.filter(
    (index) => answers[index] === questions[index].answer,
  ).length;
  const wrongCount = checked.length - correctCount;
  const progress = Math.round((checked.length / questions.length) * 100);
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const seconds = String(elapsed % 60).padStart(2, "0");

  function move(step: number) {
    const sequence = filteredIndexes.length ? filteredIndexes : questions.map((_, index) => index);
    const position = sequence.indexOf(current);
    const nextPosition = Math.min(Math.max(position + step, 0), sequence.length - 1);
    setCurrent(sequence[nextPosition]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function changeMode(nextMode: "all" | "wrong" | "bookmark") {
    setMode(nextMode);
    const candidates =
      nextMode === "wrong"
        ? questions
            .map((item, index) => ({ item, index }))
            .filter(({ item, index }) => checked.includes(index) && answers[index] !== item.answer)
            .map(({ index }) => index)
        : nextMode === "bookmark"
          ? questions.map((_, index) => index).filter((index) => bookmarks.includes(index))
          : questions.map((_, index) => index);
    if (candidates.length) setCurrent(candidates[0]);
  }

  function checkAnswer() {
    if (selected === undefined) return;
    setChecked((items) => (items.includes(current) ? items : [...items, current]));
  }

  function toggleBookmark() {
    setBookmarks((items) =>
      items.includes(current) ? items.filter((item) => item !== current) : [...items, current],
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
            {examOptions.map((exam) => (
              <button className={`exam-item ${exam.active ? "active" : ""}`} key={exam.label} disabled={!exam.active}>
                <span>{exam.label}</span>
                <small>{exam.active ? `${exam.count}문제` : "준비 중"}</small>
              </button>
            ))}
          </div>

          <div className="rail-divider" />
          <div className="eyebrow row-between"><span>문제</span><span>{checked.length}/{questions.length}</span></div>
          <div className="question-grid">
            {questions.map((item, index) => {
              const answered = checked.includes(index);
              const correct = answered && answers[index] === item.answer;
              return (
                <button
                  key={item.id}
                  className={`question-dot ${current === index ? "current" : ""} ${answered ? (correct ? "correct" : "wrong") : ""}`}
                  onClick={() => setCurrent(index)}
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
              <div className="crumb">폐기물처리기사 · 2022년 2회</div>
              <h1>기출문제 집중 학습</h1>
            </div>
            <div className="timer" aria-label={`학습 시간 ${minutes}분 ${seconds}초`}>
              <span className="timer-dot" />
              <b>{minutes}:{seconds}</b>
            </div>
          </div>

          <div className="progress-track"><span style={{ width: `${((current + 1) / questions.length) * 100}%` }} /></div>

          <article className="question-card">
            <div className="question-meta">
              <div className="number-badge">Q{String(current + 1).padStart(2, "0")}</div>
              <span>{question.subject}</span>
              <button
                className={`bookmark ${bookmarks.includes(current) ? "active" : ""}`}
                onClick={toggleBookmark}
                aria-pressed={bookmarks.includes(current)}
              >
                {bookmarks.includes(current) ? "저장됨" : "저장"}
              </button>
            </div>

            <h2>{question.text}</h2>

            <div className="choices" role="radiogroup" aria-label="답안 선택">
              {question.choices.map((choice, index) => {
                const isSelected = selected === index;
                const isAnswer = isChecked && question.answer === index;
                const isWrong = isChecked && isSelected && question.answer !== index;
                return (
                  <button
                    key={choice}
                    className={`choice ${isSelected ? "selected" : ""} ${isAnswer ? "answer" : ""} ${isWrong ? "incorrect" : ""}`}
                    onClick={() => !isChecked && setAnswers((items) => ({ ...items, [current]: index }))}
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
                  <span>{selected === question.answer ? "정답입니다" : `정답은 ${choiceMarks[question.answer]}번입니다`}</span>
                  <small>독자 작성 해설</small>
                </div>
                <p>{question.explanation}</p>
                <div className="key-point"><b>KEY</b><span>{question.keyPoint}</span></div>
              </section>
            )}

            <div className="card-actions">
              <button className="secondary-button" onClick={() => move(-1)} disabled={current === filteredIndexes[0]}>이전 문제</button>
              {!isChecked ? (
                <button className="primary-button" onClick={checkAnswer} disabled={selected === undefined}>정답 확인</button>
              ) : (
                <button className="primary-button" onClick={() => move(1)} disabled={current === filteredIndexes[filteredIndexes.length - 1]}>다음 문제</button>
              )}
            </div>
          </article>

          <p className="source-note">
            2022년 시험 기준 학습용 샘플입니다. 법규·수치는 최신 개정 여부를 별도로 확인하세요.
            <a href="https://www.comcbt.com/xe/dj" target="_blank" rel="noreferrer">문제 출처 확인</a>
          </p>
        </section>

        <aside className={`right-rail ${showPanel ? "show" : ""}`} aria-label="학습 현황">
          <button className="panel-close" onClick={() => setShowPanel(false)} aria-label="학습 현황 닫기">닫기</button>
          <div className="eyebrow">오늘의 학습</div>
          <div className="score-ring" style={{ "--score": `${progress * 3.6}deg` } as React.CSSProperties}>
            <div><strong>{progress}</strong><span>%</span><small>진행률</small></div>
          </div>
          <div className="score-stats">
            <div><span>정답</span><b className="blue">{correctCount}</b></div>
            <div><span>오답</span><b className="red">{wrongCount}</b></div>
            <div><span>저장</span><b>{bookmarks.length}</b></div>
          </div>

          <div className="rail-divider" />
          <div className="eyebrow">빠른 복습</div>
          <button className={`review-button ${mode === "all" ? "active" : ""}`} onClick={() => changeMode("all")}>
            <span>전체 문제</span><b>{questions.length}</b>
          </button>
          <button className={`review-button ${mode === "wrong" ? "active" : ""}`} onClick={() => changeMode("wrong")} disabled={!wrongCount}>
            <span>틀린 문제만</span><b>{wrongCount}</b>
          </button>
          <button className={`review-button ${mode === "bookmark" ? "active" : ""}`} onClick={() => changeMode("bookmark")} disabled={!bookmarks.length}>
            <span>저장한 문제</span><b>{bookmarks.length}</b>
          </button>

          <div className="notice-card">
            <b>데이터 안내</b>
            <p>CBT 사이트의 기존 해설은 가져오지 않았으며, 앱의 해설은 학습용으로 새로 작성했습니다.</p>
          </div>
        </aside>
      </main>

      <nav className="mobile-nav" aria-label="모바일 메뉴">
        <button onClick={() => changeMode("all")} className={mode === "all" ? "active" : ""}><span>01</span>문제풀이</button>
        <button onClick={() => changeMode("wrong")} className={mode === "wrong" ? "active" : ""}><span>{wrongCount}</span>오답노트</button>
        <button onClick={() => setShowPanel(true)}><span>{progress}%</span>학습현황</button>
      </nav>
    </div>
  );
}
