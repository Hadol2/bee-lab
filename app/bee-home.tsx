"use client";

import { useState } from "react";

const HEX_POINTS = "50,3 97,30 97,85 50,112 3,85 3,30";
const PASS_SCORE = 60;

export function BeeLogoMark({ className = "brand-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 115" aria-hidden="true">
      <polygon points={HEX_POINTS} fill="#FFC21A" stroke="#1A1408" strokeWidth="8" strokeLinejoin="round" />
      <text x="50" y="80" textAnchor="middle" fontSize="62" fontWeight="900" fill="#1A1408" fontFamily="inherit">b</text>
    </svg>
  );
}

export function BeeMascot() {
  return (
    <svg className="bee-mascot" viewBox="0 0 140 120" aria-hidden="true">
      <ellipse cx="58" cy="34" rx="26" ry="17" fill="#FFFFFF" stroke="#1A1408" strokeWidth="4" transform="rotate(-24 58 34)" />
      <ellipse cx="86" cy="30" rx="22" ry="15" fill="#FFFFFF" stroke="#1A1408" strokeWidth="4" transform="rotate(20 86 30)" />
      <path d="M118 74 L136 80 L118 86 Z" fill="#1A1408" />
      <ellipse cx="72" cy="78" rx="48" ry="34" fill="#FFC21A" stroke="#1A1408" strokeWidth="4" />
      <path d="M70 45 Q62 78 70 111" stroke="#1A1408" strokeWidth="10" fill="none" />
      <path d="M94 49 Q86 78 94 107" stroke="#1A1408" strokeWidth="10" fill="none" />
      <circle cx="40" cy="72" r="5" fill="#1A1408" />
      <circle cx="42" cy="70" r="1.6" fill="#FFFFFF" />
      <path d="M33 86 Q40 92 48 86" stroke="#1A1408" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M38 47 Q30 30 20 26" stroke="#1A1408" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <circle cx="19" cy="25" r="4.5" fill="#1A1408" />
    </svg>
  );
}

const SAMPLE = {
  meta: "2022년 2회 · 2번 · 폐기물 개론",
  text: "도시폐기물의 유기성 성분 중 셀룰로오스에 해당하는 것은?",
  choices: ["6탄당의 중합체", "아미노산 중합체", "당, 전분 등", "방향환과 메톡실기를 포함한 중합체"],
  answer: 0,
};

export function SampleQuestionCard() {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <div className="sample-card">
      <div className="sample-card-head">
        <span>미리 풀어보기</span>
        <small>{SAMPLE.meta}</small>
      </div>
      <p className="sample-card-question">{SAMPLE.text}</p>
      <div className="sample-card-choices">
        {SAMPLE.choices.map((choice, index) => {
          const state =
            picked === null ? "" : index === SAMPLE.answer ? "answer" : index === picked ? "incorrect" : "dim";
          return (
            <button
              key={choice}
              type="button"
              className={`sample-choice ${state}`}
              onClick={() => setPicked(index)}
              aria-pressed={picked === index}
            >
              <b>{["①", "②", "③", "④"][index]}</b>
              <span>{choice}</span>
              {picked !== null && index === SAMPLE.answer && <em>정답</em>}
            </button>
          );
        })}
      </div>
      <p className="sample-card-note" aria-live="polite">
        {picked === null
          ? "보기를 누르면 바로 채점돼요."
          : picked === SAMPLE.answer
            ? "정답! 셀룰로오스는 포도당(6탄당)이 β결합으로 이어진 중합체예요."
            : "아쉬워요. 셀룰로오스는 6탄당(포도당)의 중합체예요."}
      </p>
    </div>
  );
}

export type HiveCell = {
  date: string;
  label: string;
  total: number;
  checked: number;
  correct: number | null;
};

const HIVE_GAP = 0.08;
const HIVE_H = 1.1547;
const HIVE_STEP_Y = HIVE_H * 0.75 + HIVE_GAP * 0.866;

type CombLayout = { rows: number[]; staggerOdd: boolean };
const DESKTOP_COMB: CombLayout = { rows: [7, 6, 7], staggerOdd: false };
const MOBILE_COMB: CombLayout = { rows: [4, 4, 4, 4, 4], staggerOdd: true };

function combGeometry({ rows, staggerOdd }: CombLayout) {
  const widest = Math.max(...rows);
  const columns = staggerOdd ? widest + 0.5 : widest;
  const width = columns + (widest - 1) * HIVE_GAP + (staggerOdd ? HIVE_GAP / 2 : 0);
  const height = (rows.length - 1) * HIVE_STEP_Y + HIVE_H;
  const rowStarts = rows.map((_, row) => rows.slice(0, row).reduce((sum, count) => sum + count, 0));
  const slots = rows.flatMap((count, row) => {
    const offset = staggerOdd ? (row % 2 ? (1 + HIVE_GAP) / 2 : 0) : count < widest ? ((widest - count) * (1 + HIVE_GAP)) / 2 : 0;
    return Array.from({ length: count }, (_, col) => ({
      index: rowStarts[row] + col,
      left: ((offset + col * (1 + HIVE_GAP)) / width) * 100,
      top: ((row * HIVE_STEP_Y) / height) * 100,
    }));
  });
  return { width, height, slots };
}

function shortLabel(label: string) {
  const match = label.match(/(\d{4})년\s*([\d·]+)회/);
  return match ? `${match[1].slice(2)}·${match[2]}회` : label;
}

function cellState(cell: HiveCell) {
  const complete = cell.checked >= cell.total;
  const score = cell.correct === null ? null : Math.round((cell.correct / cell.total) * 100);
  if (complete && score !== null) {
    return score >= PASS_SCORE
      ? { tone: "is-pass", value: `${score}점`, score }
      : { tone: "is-fail", value: `${score}점`, score };
  }
  if (cell.checked > 0) {
    return { tone: "is-progress", value: `${Math.round((cell.checked / cell.total) * 100)}%`, score: null };
  }
  return { tone: "is-empty", value: "—", score: null };
}

export function BeeHive({
  cells,
  ready,
  disabled,
  onOpen,
}: {
  cells: HiveCell[];
  ready: boolean;
  disabled: boolean;
  onOpen: (date: string) => void;
}) {
  const states = cells.map((cell) => (ready ? cellState(cell) : { tone: "is-empty", value: "—", score: null }));
  const scores = states.flatMap((state) => (state.score === null ? [] : [state.score]));
  const passed = states.filter((state) => state.tone === "is-pass").length;
  const average = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null;

  const renderComb = (layout: CombLayout, variant: string) => {
    const { width, height, slots } = combGeometry(layout);
    return (
      <div className={`bee-hive-comb ${variant}`} style={{ aspectRatio: `${width} / ${height}` }}>
        {slots.map(({ index, left, top }) => {
          const cell = cells[index];
          const state = states[index];
          if (!cell) return null;
          return (
            <button
              key={cell.date}
              type="button"
              className={`hive-cell ${state.tone}`}
              style={{ left: `${left}%`, top: `${top}%`, width: `${100 / width}%`, height: `${(HIVE_H / height) * 100}%` }}
              onClick={() => onOpen(cell.date)}
              disabled={disabled}
              aria-label={`${cell.label} ${state.tone === "is-empty" ? "미응시" : state.value} · 회차 풀기`}
            >
              <svg viewBox="0 0 100 115" aria-hidden="true" preserveAspectRatio="none">
                <polygon points={HEX_POINTS} />
              </svg>
              <span className="hive-cell-label">{shortLabel(cell.label)}</span>
              <b className="hive-cell-value">{state.value}</b>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <section className="bee-hive" aria-labelledby="bee-hive-title">
      <div className="bee-hive-head">
        <div>
          <span className="section-tag">MY HIVE</span>
          <h2 id="bee-hive-title">회차별 벌집 채우기</h2>
          <p>회차를 끝까지 풀면 칸이 채워져요. 60점을 넘기면 꿀이 가득 찹니다.</p>
        </div>
        <div className="bee-hive-stats">
          <div><strong>{ready ? passed : 0}<small>/{cells.length}</small></strong><span>합격선 회차</span></div>
          <div><strong>{ready && average !== null ? average : "—"}</strong><span>평균 점수</span></div>
        </div>
      </div>
      {renderComb(DESKTOP_COMB, "is-wide")}
      {renderComb(MOBILE_COMB, "is-narrow")}
      <div className="bee-hive-legend">
        <span><i className="is-pass" /> 60점 이상</span>
        <span><i className="is-progress" /> 푸는 중</span>
        <span><i className="is-fail" /> 60점 미만</span>
        <span><i className="is-empty" /> 미응시</span>
        <small>기록은 이 기기에 저장돼요</small>
      </div>
    </section>
  );
}

export type SubjectStat = { subject: string; correct: number; total: number };

export function SubjectStats({ stats, ready }: { stats: SubjectStat[]; ready: boolean }) {
  return (
    <section className="subject-stats" aria-labelledby="subject-stats-title">
      <div className="home-section-heading">
        <div><span>과목별 정답률</span><h2 id="subject-stats-title">약한 과목부터 채워요</h2></div>
        <small>과락 기준 40점</small>
      </div>
      <div className="subject-stat-grid">
        {stats.map((item, index) => {
          const rate = ready && item.total ? Math.round((item.correct / item.total) * 100) : null;
          const tone = rate === null ? "none" : rate < 40 ? "danger" : rate < 60 ? "warn" : "ok";
          return (
            <article className={`subject-stat tone-${tone}`} key={item.subject}>
              <span className="subject-stat-index">{index + 1}과목</span>
              <h3>{item.subject}</h3>
              <strong>{rate === null ? "기록 없음" : `${rate}%`}</strong>
              <div className="subject-stat-bar"><i style={{ width: `${rate ?? 0}%` }} /></div>
              <small>{rate === null ? "아직 푼 문제가 없어요" : `${item.total.toLocaleString("ko-KR")}문제 중 ${item.correct.toLocaleString("ko-KR")}개 정답`}</small>
            </article>
          );
        })}
      </div>
    </section>
  );
}
