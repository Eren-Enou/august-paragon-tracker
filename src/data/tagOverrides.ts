import type { Tag } from "../types/achievements";

export type TagOverride = {
  add?: Tag[];
  remove?: Tag[];
};

// Use achievement.id as the key (stable even if names repeat)
export const TAG_OVERRIDES: Record<string, TagOverride> = {
  // Example:
  // "a1b2c3d4e5f6": { remove: ["Clues"], add: ["Skills"] },
};
