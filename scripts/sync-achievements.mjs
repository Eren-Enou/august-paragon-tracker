import fs from "node:fs/promises";
import path from "node:path";

const RAW_URL =
  "https://wiki.august.games/wiki/Paragon_League/Achievements?action=raw";

const TIERS = [
  "Starter",
  "Apprentice",
  "Adept",
  "Expert",
  "Master",
  "Grandmaster",
  "Heroic",
];

function slug(s) {
  return s
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Detect patterns like "25x", "20,000x"
function extractTarget(text) {
  const m = text.match(/(\d[\d,]*)\s*x\b/i);
  if (!m) return null;
  const n = Number(m[1].replaceAll(",", ""));
  return Number.isFinite(n) ? n : null;
}

function cleanCell(s) {
  return (
    s
      // remove wiki links like [[Page|Text]] -> Text, [[Page]] -> Page
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
      // remove refs/templates that can appear inline
      .replace(/\{\{[^}]+\}\}/g, "")
      // convert HTML entities-ish leftovers
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Parses one section's wikitable.
 * We look for rows like:
 * |-
 * | Name || Description || Rewards
 */
function parseWikiTable(sectionText, tier) {
  const achievements = [];

  // Grab each table row chunk (between "|-" markers)
  const rowChunks = sectionText.split(/\n\|-\s*\n/);

  for (const chunk of rowChunks) {
    // Look for a row that starts with "|" and contains "||"
    // Example:
    // | Gatherer || Gather 1x ... || 1x Gatherer Scroll
    const m = chunk.match(/^\|\s*(.+?)\s*\|\|\s*(.+?)\s*\|\|\s*(.+?)\s*$/m);
    if (!m) continue;

    const name = cleanCell(m[1]);
    const description = cleanCell(m[2]);
    const rewardsText = cleanCell(m[3]);

    // Skip header row if it exists in table
    if (
      name.toLowerCase() === "name" &&
      description.toLowerCase().includes("description")
    ) {
      continue;
    }

    if (!name || !description) continue;

    achievements.push({
      id: `${slug(tier)}_${slug(name)}`,
      tier,
      name,
      description,
      rewardsText,
      target: extractTarget(description),
    });
  }

  return achievements;
}

function extractSection(text, tier) {
  // Match headings like "== Starter ==" (allow extra whitespace)
  const headingRe = new RegExp(`^==\\s*${tier}\\s*==\\s*$`, "mi");
  const match = text.match(headingRe);
  if (!match || match.index == null) return null;

  const startIdx = match.index + match[0].length;

  // Next tier heading or end of document
  const nextHeadingRe = /^==\s*(Starter|Apprentice|Adept|Expert|Master|Grandmaster|Heroic)\s*==\s*$/gim;
  nextHeadingRe.lastIndex = startIdx;

  const next = nextHeadingRe.exec(text);
  const endIdx = next?.index ?? text.length;

  return text.slice(startIdx, endIdx);
}

async function main() {
  const res = await fetch(RAW_URL, {
    headers: { "user-agent": "paragon-achievement-sync/1.0" },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch wiki raw text (${res.status})`);
  }

  const raw = await res.text();

  const all = [];
  for (const tier of TIERS) {
    const section = extractSection(raw, tier);
    if (!section) continue;

    const parsed = parseWikiTable(section, tier);
    all.push(...parsed);
  }

  if (all.length < 20) {
    // Write debug file so you can inspect what came back
    const debugPath = path.join(process.cwd(), "scripts", "debug-raw.txt");
    await fs.writeFile(debugPath, raw, "utf8");
    throw new Error(
      `Parsed too few achievements (${all.length}). Wrote raw wiki text to ${debugPath} for inspection.`
    );
  }

  const outPath = path.join(process.cwd(), "src", "data", "achievements.json");
  await fs.writeFile(outPath, JSON.stringify(all, null, 2), "utf8");

  console.log(`Wrote ${all.length} achievements to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
