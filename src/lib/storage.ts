import type { ProgressFileV1 } from "../types/achievements";

const STORAGE_KEY = "paragon_progress_v1";

export function loadProgress(): ProgressFileV1 {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const now = new Date().toISOString();
    return { version: 1, updatedAt: now, progressById: {} };
  }

  try {
    const parsed = JSON.parse(raw) as ProgressFileV1;
    if (parsed?.version !== 1 || typeof parsed.progressById !== "object") {
      throw new Error("Invalid progress file");
    }
    return parsed;
  } catch {
    const now = new Date().toISOString();
    return { version: 1, updatedAt: now, progressById: {} };
  }
}

export function saveProgress(progress: ProgressFileV1) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}
