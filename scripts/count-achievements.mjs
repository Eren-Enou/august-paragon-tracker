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

function extractSection(text, tier) {
  const headingRe = new RegExp(`^==\\s*${tier}\\s*==\\s*$`, "mi");
  const match = text.match(headingRe);
  if (!match || match.index == null) return null;

  const startIdx = match.index + match[0].length;

  const nextHeadingRe =
    /^==\s*(Starter|Apprentice|Adept|Expert|Master|Grandmaster|Heroic)\s*==\s*$/gim;
  nextHeadingRe.lastIndex = startIdx;

  const next = nextHeadingRe.exec(text);
  const endIdx = next?.index ?? text.length;

  return text.slice(startIdx, endIdx);
}

function cleanCell(s) {
  return s
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countRows(sectionText) {
  // Same row assumption as sync script: "| Name || Desc || Rewards"
  const rowChunks = sectionText.split(/\n\|-\s*\n/);
  let count = 0;

  for (const chunk of rowChunks) {
    const m = chunk.match(/^\|\s*(.+?)\s*\|\|\s*(.+?)\s*\|\|\s*(.+?)\s*$/m);
    if (!m) continue;

    const name = cleanCell(m[1]);
    const desc = cleanCell(m[2]);

    if (!name || !desc) continue;
    if (
      name.toLowerCase() === "name" &&
      desc.toLowerCase().includes("description")
    ) {
      continue;
    }

    count++;
  }

  return count;
}

async function main() {
  const res = await fetch(RAW_URL, {
    headers: { "user-agent": "paragon-achievement-counter/1.0" },
  });
  if (!res.ok) throw new Error(`Failed to fetch raw wiki (${res.status})`);

  const raw = await res.text();

  let total = 0;
  console.log("Achievement count by tier:");
  for (const tier of TIERS) {
    const section = extractSection(raw, tier);
    if (!section) {
      console.log(`- ${tier}: (missing section)`);
      continue;
    }
    const c = countRows(section);
    total += c;
    console.log(`- ${tier}: ${c}`);
  }

  console.log(`\nTOTAL: ${total}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
