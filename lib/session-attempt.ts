export type SavedAttemptState = {
  answers: Record<string, number>;
  checked: string[];
  mockSubmitted: boolean;
};

export function captureSessionAttempt(
  questionIds: string[],
  answers: Record<string, number>,
  checked: string[],
  mockSubmitted: boolean,
): SavedAttemptState {
  const ids = new Set(questionIds);
  return {
    answers: Object.fromEntries(Object.entries(answers).filter(([id]) => ids.has(id))),
    checked: checked.filter((id) => ids.has(id)),
    mockSubmitted,
  };
}

export function restoreSessionAttempt(
  questionIds: string[],
  currentAnswers: Record<string, number>,
  currentChecked: string[],
  saved: SavedAttemptState,
) {
  const ids = new Set(questionIds);
  return {
    answers: {
      ...Object.fromEntries(Object.entries(currentAnswers).filter(([id]) => !ids.has(id))),
      ...saved.answers,
    },
    checked: [...currentChecked.filter((id) => !ids.has(id)), ...saved.checked],
  };
}
