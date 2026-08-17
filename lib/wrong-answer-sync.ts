export const FIRST_SYNC_STORAGE_KEY = "waste-cbt-first-sync-v1";

export function parseCompletedFirstSyncIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function hasCompletedFirstSync(accountId: string, completedAccountIds: string[]): boolean {
  return completedAccountIds.includes(accountId);
}

export function withCompletedFirstSync(
  accountId: string,
  completedAccountIds: string[],
): string[] {
  return completedAccountIds.includes(accountId)
    ? completedAccountIds
    : [...completedAccountIds, accountId];
}

export function resolveSyncedWrongIds(
  isFirstSync: boolean,
  localWrongIds: string[],
  serverWrongIds: string[],
): string[] {
  return isFirstSync
    ? [...new Set([...localWrongIds, ...serverWrongIds])]
    : [...new Set(serverWrongIds)];
}
