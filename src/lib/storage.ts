import type { ProgressFileV1 } from "../types/achievements";

function storageKey(userKey: string) {
  return `paragon-progress:v1:${userKey}`;
}

export function loadProgress(userKey = "default"): ProgressFileV1 {
  const raw = localStorage.getItem(storageKey(userKey));
  if (!raw) return { version: 1, updatedAt: new Date().toISOString(), progressById: {} };

  try {
    const parsed = JSON.parse(raw) as ProgressFileV1;
    if (parsed?.version !== 1 || typeof parsed.progressById !== "object") {
      return { version: 1, updatedAt: new Date().toISOString(), progressById: {} };
    }
    return parsed;
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), progressById: {} };
  }
}

export function saveProgress(userKey: string, data: ProgressFileV1) {
  localStorage.setItem(storageKey(userKey), JSON.stringify(data));
}
