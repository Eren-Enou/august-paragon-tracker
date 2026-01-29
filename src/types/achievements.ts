export type Tier =
  | "Starter"
  | "Apprentice"
  | "Adept"
  | "Expert"
  | "Master"
  | "Grandmaster"
  | "Heroic";

export type Tag =
  | "Clues"
  | "Voting"
  | "World Boss"
  | "Slayer"
  | "Bosses"
  | "Chests"
  | "Collection Log"
  | "Prestige"
  | "Skills"
  | "Events"
  | "Gear";


export type Achievement = {
  id: string;
  tier: Tier;
  name: string;
  description: string;
  rewardsText: string;
  tags?: Tag[];

  // Derived fields (filled by code, not required in JSON)
  target?: number | null; // if "25x", "20,000x", etc
};

export type AchievementProgress = {
  completed: boolean;
  count?: number;
  updatedAt: string; // ISO string
};

export type ProgressFileV1 = {
  version: 1;
  updatedAt: string;
  progressById: Record<string, AchievementProgress>;
};
