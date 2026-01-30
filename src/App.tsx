import { useEffect, useMemo, useRef, useState } from "react";
import achievementsData from "./data/achievements.json";
import type { Achievement, ProgressFileV1, Tier, Tag } from "./types/achievements";
import { loadProgress, saveProgress } from "./lib/storage";
import { TAG_OVERRIDES } from "./data/tagOverrides";
import "./App.css"


const ALL_TIERS: Tier[] = [
  "Starter",
  "Apprentice",
  "Adept",
  "Expert",
  "Master",
  "Grandmaster",
  "Heroic",
];



const ALL_TAGS: Tag[] = [
  "Clues",
  "Voting",
  "World Boss",
  "Slayer",
  "Bosses",
  "Raids",
  "Combat",
  "Chests",
  "Collection Log",
  "Prestige",
  "Skills",
  "Events",
  "Gear",
];





function inferTags(a: { name: string; description: string; rewardsText: string }): Tag[] {
  //const text = `${a.name} ${a.description} ${a.rewardsText}`.toLowerCase();
  // IMPORTANT: separate “core” text from “rewards”
  const core = `${a.name} ${a.description}`.toLowerCase();
  const full = `${a.name} ${a.description} ${a.rewardsText}`.toLowerCase();
  //const tags: Tag[] = [];
  //const has = (re: RegExp) => re.test(text);
  const tags: Tag[] = [];
  const hasCore = (re: RegExp) => re.test(core);
  const hasFull = (re: RegExp) => re.test(full);

  const isRestoreHpPrayer =
    hasFull(/\brestore\b.*\b(hp|health|prayer)\b/) ||
    hasFull(/\b(hp|health|prayer)\s*points?\b/);

  const isPrestige = hasFull(/\bprestige\b/);

  const isWorldBoss = hasFull(/\bworld boss\b|::wb\b/);

  //const mentionsToaKeyOrChest =
  //  hasFull(/\btoa\b/) && hasFull(/\b(key|common key|purple key|chest|chests)\b/);

  const mentionsBarrowsKill =
    hasFull(/\bbarrows\b/) && hasFull(/\bkill|defeat\b/);


  // --- Clues (more specific to reduce false positives) ---
  const isFishingCasketThing =
    hasCore(/\bcasket\b/) && hasCore(/\bgather\b|\bfish(ing)?\b|\bcatch\b/);

  if (
    !isRestoreHpPrayer &&
    !isFishingCasketThing &&
    hasCore(/\bclue scroll\b|\bclues?\b(?!\s*token)|\bmimic\b|\btreasure trail\b|\bclue casket\b/)
  ) {
    tags.push("Clues");
  }

  // --- Voting (prefer commands / explicit voting terms) ---
  if (hasFull(/::vote\b|claimvotes\b|\bvoting\b|\bvote points?\b/)) tags.push("Voting");

  // --- World Boss ---
  if (isWorldBoss) tags.push("World Boss");

  // --- Slayer ---
  const isDragonSlayerQuestThing = hasFull(/\bdragon slayer\b/);
  // “slayer” should be about the skill / tasks / points, not boss names
  const slayerSignals = hasFull(/\bslayer task(s)?\b|\bslayer points?\b|\bsuperior\b|\bslayer master\b|\b(task|assignment)\b.*\bslayer\b/);

  if (
    slayerSignals &&
    !isDragonSlayerQuestThing &&
    !isRestoreHpPrayer &&
    !hasFull(/\bzulrah\b|\byama\b/) // explicitly not slayer-related in your setup
  ) {
    tags.push("Slayer");
  }

  // --- Bosses (explicit boss list; avoid generic "boss" tagging) ---
  const BOSS_NAMES =
  /\b(jad|fire capes?|giant mole|obor|bryophyta|dharok|graardor|zilyana|kree|k'ril|kril|cerberus|kraken|thermonuclear|zulrah|barrows|echo kings?|scurrius|nex|ice and zaros|alchemical hydra|hydra|yama|ignis|danger snek|azrael)\b/;

  // If an achievement is clearly about chests/equipping/world boss/etc.,
    // don't let it be tagged as Bosses just because it mentions a raid/boss word.
  const bossExclude = hasFull(
    /\b(toa|tob|theatre|gwd|godwars)\b.*\b(chest|casket|reward|rewards)\b|\b(open|unlock)\b.*\b(chest|casket)\b|\b(ethereal|crystal|giant)\s+chest\b|\btoa\s+(purple|common)\s+chests?\b|\bworld boss\b|::wb\b|\btemper\b|\bequip\b/
  );

  if (
      !bossExclude &&
      hasFull(BOSS_NAMES)
    ) {
        tags.push("Bosses");
    }
      

  // --- Raids ---
  // --- Raids ---
  const raidBosses =
        /\b(zebak|kephri|baba|akkha|warden|maiden|bloat|nylocas|sotetseg|xarpus|verzik|yama|olympian)\b/;

  const raidKeywords =
        /\b(toa|tob|theatre of blood|tombs of amascut)\b/;

  if (!bossExclude && (hasFull(raidBosses) || hasFull(raidKeywords))) {
        tags.push("Raids");
  }

 


  // --- Chests ---
  const chestNames =
    /\b(toa common chests?\b|toa purple chests?\b|crystal chest\b|ethereal chest\b|giant chest\b)\b/;

  const chestVerb =
    /\b(open|loot|claim|unlock)\b/;

  if (
    !mentionsBarrowsKill &&
    (hasFull(chestNames) || (hasFull(/\bchest\b(?!plate)/) && hasFull(chestVerb)))
  ) {
    tags.push("Chests");
  }

  // --- Collection Log / Prestige / Events ---
  if (hasFull(/\bcollection log\b/)) tags.push("Collection Log");
  if (isPrestige) tags.push("Prestige");
  if (hasFull(/\brandom event\b|\btrivia\b|\bevent(s)?\b/)) tags.push("Events");

  // --- Skills ---
  if (
    !isPrestige &&
    hasFull(
      /\b(skill|gather|craft|mining|woodcutting|fishing|thieving|crafting|smithing|fletching|herblore|agility|runecraft(ing)?)\b/
    )
  ) {
    tags.push("Skills");
  }

  // --- Gear (add Temper) ---
  if (
    hasFull(
      /\bequip\b|\b(armou?r|boots|helm(et)?|platebody|platelegs|legs|gloves|shield|staff|bow|crossbow|cape|temper)\b/
    )
  ) {
    tags.push("Gear");
  }

  // --- Combat (fallback only; don't overlap with Slayer/Bosses/Raids/World Boss/Chests/etc.) ---
  const isAlreadySpecific =
      tags.includes("Slayer") ||
      tags.includes("Bosses") ||
      tags.includes("Raids") ||
      tags.includes("World Boss") ||
      tags.includes("Chests") ||
      tags.includes("Clues") ||
      tags.includes("Skills") ||
      tags.includes("Events") ||
      tags.includes("Gear") ||
      tags.includes("Voting") ||
      tags.includes("Collection Log") ||
      tags.includes("Prestige");

  const combatExclude = hasFull(
      /\bslayer\b|\btask(s)?\b|\b(superior|konar|duradel)\b|\bworld boss\b|::wb\b|\b(toa|tob|theatre|tombs of amascut)\b|\b(chest|casket|key)\b/
  );

  const genericCombat = hasFull(
      /\b(kill|defeat|slay)\b\s+\d+|\bkill\b\s+\w+|\bdefeat\b\s+\w+|\bslay\b\s+\w+/
  );

  if (!isAlreadySpecific && !combatExclude && genericCombat) {
      tags.push("Combat");
  }

  return Array.from(new Set(tags));
}


function applyTagOverrides(base: Tag[], id: string): Tag[] {
  const o = TAG_OVERRIDES[id];
  if (!o) return base;

  let tags = new Set<Tag>(base);

  for (const t of o.remove ?? []) tags.delete(t);
  for (const t of o.add ?? []) tags.add(t);

  return Array.from(tags);
}



function nowIso() {
  return new Date().toISOString();
}

function normalize(s: string) {
  return s.toLowerCase().trim();
}

// Detect patterns like "25x", "20,000x"
function extractTarget(description: string): number | null {
  const m = description.match(/(\d[\d,]*)\s*x\b/i);
  if (!m) return null;
  const raw = m[1].replaceAll(",", "");
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

function tierStats(
  tier: Tier,
  achievements: Achievement[],
  progressFile: ProgressFileV1
) {
  const list = achievements.filter((a) => a.tier === tier);
  let done = 0;

  for (const a of list) {
    const p = progressFile.progressById[a.id];
    if (a.target != null) {
      if ((p?.count ?? 0) >= a.target) done++;
    } else {
      if (p?.completed) done++;
    }
  }

  return { done, total: list.length };
}





export default function App() {
    const userKey = useMemo(() => {
      const params = new URLSearchParams(window.location.search);
      const u = params.get("u");

      if (u && u.trim()) return u.trim().toLowerCase();

      // No u= in URL → generate one and redirect
      const id = Math.random().toString(36).slice(2, 14);
      params.set("u", id);
      const url = new URL(window.location.href);
      url.search = params.toString();
      window.history.replaceState({}, "", url.toString());

      return id;
    }, []);


    function randomId(len = 12) {
      return Math.random().toString(36).slice(2, 2 + len);
    }

    function setUrlProfile(id: string) {
      const clean = id.trim().toLowerCase();
      if (!clean) return;

      const url = new URL(window.location.href);
      url.searchParams.set("u", clean);
      window.location.href = url.toString(); // reloads into that profile
    }

    function handleNewProfileGo() {
      setUrlProfile(newProfileId);
    }

    function handleNewProfileRandom() {
      setUrlProfile(randomId());
    }




    function resetCurrentProfile() {
          const ok = confirm(
            `Reset all progress for profile "${userKey}"?\nThis only clears data saved in THIS browser.`
          );
          if (!ok) return;

          localStorage.removeItem(`paragon-progress:v1:${userKey}`);

          // reset UI immediately
          setProgressFile({
            version: 1,
            updatedAt: nowIso(),
            progressById: {},
          });

          // also collapse any expanded completed cards (optional)
          setExpandedIds(new Set());
        }




  // Load achievements + derive targets
    const achievements = useMemo(() => {
        const raw = achievementsData as Achievement[];
        const byId = new Map<string, Achievement>();

        for (const a of raw) {
          // Skip exact duplicate IDs (safety guard)
          if (byId.has(a.id)) continue;

          const autoTags = inferTags(a);
          const finalTags = applyTagOverrides(autoTags, a.id);

          byId.set(a.id, {
            ...a,
            target: extractTarget(a.description),
            tags: finalTags,
          });
        }

        return Array.from(byId.values());
    }, []);


    type SortMode = "Default" | "IncompleteFirst" | "MostProgress" | "LeastProgress" | "AZ";
    const [sortMode, setSortMode] = useState<SortMode>("Default");

    const [showFaq, setShowFaq] = useState(false);
    const [newProfileId, setNewProfileId] = useState("");

    function closeFaq() {
      setShowFaq(false);
    }

    function openFaq() {
      setShowFaq(true);
    }



    const [progressFile, setProgressFile] = useState<ProgressFileV1>(() =>
      loadProgress(userKey)
    );

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  function toggleExpanded(id: string) {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }



  const [selectedTags, setSelectedTags] = useState<Set<Tag>>(() => new Set());

    function toggleTag(tag: Tag) {
      setSelectedTags((prev) => {
        const next = new Set(prev);
        if (next.has(tag)) next.delete(tag);
        else next.add(tag);
        return next;
      });
    }

    function clearTags() {
      setSelectedTags(new Set());
    }


  // Debounced search
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setQuery(queryInput), 150);
    return () => window.clearTimeout(t);
  }, [queryInput]);

  const [tierFilter, setTierFilter] = useState<Tier | "All">("All");
  const [incompleteOnly, setIncompleteOnly] = useState(false);

  const importInputRef = useRef<HTMLInputElement | null>(null);

  // Collapsible tiers
    const [collapsed, setCollapsed] = useState<Record<Tier, boolean>>(() => {
      const init: Record<Tier, boolean> = {} as Record<Tier, boolean>;
      for (const t of ALL_TIERS) init[t] = false;
      return init;
    });

    function toggleTier(tier: Tier) {
      setCollapsed((prev) => ({ ...prev, [tier]: !prev[tier] }));
    }

    function collapseAll() {
      const next = {} as Record<Tier, boolean>;
      for (const t of ALL_TIERS) next[t] = true;
      setCollapsed(next);
    }

    function expandAll() {
      const next = {} as Record<Tier, boolean>;
      for (const t of ALL_TIERS) next[t] = false;
      setCollapsed(next);
    }


  // Persist progress
  useEffect(() => {
    saveProgress(userKey, progressFile);
  }, [userKey, progressFile]);


  function getProgress(id: string) {
    return progressFile.progressById[id];
  }

  function setCompleted(id: string, completed: boolean) {
    setProgressFile((prev) => {
      const existing = prev.progressById[id];
      return {
        ...prev,
        updatedAt: nowIso(),
        progressById: {
          ...prev.progressById,
          [id]: {
            completed,
            count: existing?.count,
            updatedAt: nowIso(),
          },
        },
      };
    });
  }

  function setCount(id: string, count: number) {
    setProgressFile((prev) => {
      const existing = prev.progressById[id];
      return {
        ...prev,
        updatedAt: nowIso(),
        progressById: {
          ...prev.progressById,
          [id]: {
            completed: existing?.completed ?? false,
            count,
            updatedAt: nowIso(),
          },
        },
      };
    });
  }

  // Filtering
  const filtered = useMemo(() => {
    const q = normalize(query);

    return achievements.filter((a) => {

        if (selectedTags.size > 0) {
          const tags = new Set(a.tags ?? []);
          let ok = false;

          for (const t of selectedTags) {
            if (tags.has(t)) {
              ok = true;
              break;
            }
          }

          if (!ok) return false;
        }


      if (tierFilter !== "All" && a.tier !== tierFilter) return false;

      if (q) {
        const hay = normalize(`${a.name} ${a.description} ${a.rewardsText}`);
        if (!hay.includes(q)) return false;
      }

      if (incompleteOnly) {
        const p = getProgress(a.id);
        if (a.target != null) {
          const c = p?.count ?? 0;
          if (c >= a.target) return false;
        } else {
          if (p?.completed) return false;
        }
      }

      return true;
    });
  }, [achievements, query, tierFilter, incompleteOnly, selectedTags, progressFile.progressById]);




  // Group by tier
  const grouped = useMemo(() => {
    const map = new Map<Tier, Achievement[]>();
    for (const t of ALL_TIERS) map.set(t, []);

    for (const a of filtered) {
      map.get(a.tier)?.push(a);
    }

    return ALL_TIERS.map((t) => [t, map.get(t) ?? []] as const).filter(
      ([, list]) => list.length > 0
    );
  }, [filtered]);

  const totalCount = achievements.length;

  const completedCount = useMemo(() => {
    let done = 0;
    for (const a of achievements) {
      const p = getProgress(a.id);
      if (a.target != null) {
        if ((p?.count ?? 0) >= a.target) done++;
      } else if (p?.completed) {
        done++;
      }
    }
    return done;
  }, [achievements, progressFile.progressById]);

  useEffect(() => {
  const seen = new Set<string>();
  const dups: string[] = [];
  for (const a of achievements) {
    if (seen.has(a.id)) dups.push(`${a.id} :: ${a.name}`);
    else seen.add(a.id);
  }
  if (dups.length) {
    console.warn("DUPLICATE ACHIEVEMENT IDS:", dups);
    alert(`Duplicate IDs detected: ${dups.length}. Check console.`);
  }
}, [achievements]);

  useEffect(() => {
      const sm = achievements.filter(a => a.name === "Slayer Master" && a.tier === "Master");
      console.log("Slayer Master entries:", sm);
  }, [achievements]);



  // Export / Import
  function exportProgress() {
    downloadJson(`paragon-progress-${userKey}.json`, progressFile);
    
    
  }

  async function handleImportFile(file: File) {
    const text = await file.text();

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      alert("That file isn't valid JSON.");
      return;
    }

    const obj = parsed as Partial<ProgressFileV1>;
    if (obj.version !== 1 || typeof obj.progressById !== "object") {
      alert("That doesn't look like a valid paragon-progress.json file.");
      return;
    }

    // Keep only ids that exist
    const validIds = new Set(achievements.map((a) => a.id));
    const cleaned: ProgressFileV1 = {
      version: 1,
      updatedAt: nowIso(),
      progressById: {},
    };

    for (const [id, val] of Object.entries(obj.progressById ?? {})) {
      if (!validIds.has(id)) continue;
      const v = val as any;
      cleaned.progressById[id] = {
        completed: !!v.completed,
        count:
          typeof v.count === "number" && Number.isFinite(v.count)
            ? Math.max(0, Math.floor(v.count))
            : undefined,
        updatedAt: typeof v.updatedAt === "string" ? v.updatedAt : nowIso(),
      };
    }

    const shouldMerge = confirm(
      "Merge with current progress?\nOK = Merge\nCancel = Replace"
    );

    if (shouldMerge) {
      setProgressFile((prev) => ({
        version: 1,
        updatedAt: nowIso(),
        progressById: { ...prev.progressById, ...cleaned.progressById },
      }));
    } else {
      setProgressFile(cleaned);
    }

    alert("Progress imported!");
  }



  function openImportPicker() {
    importInputRef.current?.click();
  }


  return (
    <div style={{
      minHeight: "100vh",
      maxWidth: 980,
      margin: "0 auto",
      padding: 16,
      }}
    >
      <h1 style={{ marginBottom: 6 }}>Paragon League Achievements Tracker</h1>
      <p style={{ marginTop: 0, opacity: 0.8 }}>
        Saved locally in your browser. Completed: {completedCount} / {totalCount}
      </p>

      {/* Controls */}
      <div
        style={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            backdropFilter: "blur(10px)",
            background: "rgba(20, 4, 20, 0.65)",
            borderBottom: "1px solid rgba(78, 222, 243, 0.12)",
            paddingTop: 8,
            paddingBottom: 8,
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
            padding: 12,
            borderRadius: 12,

          }}
      >
        <input
          className="input"
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          placeholder="Search name / description / rewards..."
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #ddd",
            minWidth: 260,
            flex: "1 1 260px",
          }}
        />

        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value as Tier | "All")}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #ddd",
          }}
        >
          <option value="All">All tiers</option>
          {ALL_TIERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid rgba(78, 222, 243, 0.18)",
            background: "rgba(26, 22, 51, 0.65)",
            color: "var(--text)",
          }}
        >
          <option value="Default">Sort: Default</option>
          <option value="IncompleteFirst">Sort: Incomplete first</option>
          <option value="MostProgress">Sort: Most progress</option>
          <option value="LeastProgress">Sort: Least progress</option>
          <option value="AZ">Sort: A → Z</option>
        </select>


        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            className="input"
            type="checkbox"
            checked={incompleteOnly}
            onChange={(e) => setIncompleteOnly(e.target.checked)}
          />
          Incomplete only
        </label>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ opacity: 0.7 }}>Tags:</span>

          {ALL_TAGS.map((tag) => (
            <label key={tag} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                className="input"
                type="checkbox"
                checked={selectedTags.has(tag)}
                onChange={() => toggleTag(tag)}
              />
              {tag}
            </label>
          ))}

          <button onClick={clearTags} className="button">
            Clear tags
          </button>
        </div>


        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={exportProgress} className="button">Export</button>
          <button onClick={openImportPicker} className="button">Import</button>
          <button onClick={openFaq} className="button">FAQ</button>
          <button onClick={expandAll} className="button">Expand all</button>
          <button onClick={collapseAll} className="button">Collapse all</button>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              className="input"
              value={newProfileId}
              onChange={(e) => setNewProfileId(e.target.value)}
              placeholder="New profile id (e.g. test-alt)"
              style={{ width: 220 }}
            />

            <button className="button" onClick={handleNewProfileGo} disabled={!newProfileId.trim()}>
              Switch
            </button>

            <button className="button" onClick={handleNewProfileRandom}>
              Random profile
            </button>

            <button className="button button--danger" onClick={resetCurrentProfile}>
              Reset profile
            </button>
          </div>

          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportFile(f);
              e.currentTarget.value = "";
            }}
          />
        </div>


        <div
            style={{
            marginTop: 6,
            fontSize: 12,
            opacity: 0.75,
            paddingLeft: 4,
            }}
        >
            Active profile: <b>{userKey}</b>
        </div>

      </div>

      <div style={{ opacity: 0.75, marginTop: 10 }}>
          Showing <b>{filtered.length}</b> of <b>{achievements.length}</b> achievements
      </div>

        {filtered.length === 0 && (
          <div className="panel" style={{ marginTop: 14, padding: 14 }}>
            <div style={{ fontWeight: 900 }}>No results</div>
            <div style={{ opacity: 0.8, marginTop: 6 }}>
              Your current filters/search returned 0 achievements.
            </div>
            <button className="button" style={{ marginTop: 10 }} onClick={() => {
              setQueryInput("");
              setQuery("");
              setTierFilter("All");
              setIncompleteOnly(false);
              setSelectedTags(new Set());
              setSortMode("Default");
            }}>
              Clear all filters
            </button>
          </div>
        )}



      {/* List */}
      {grouped.map(([tierName, list]) => {
        const stats = tierStats(tierName, achievements, progressFile);
        const pct =
          stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

        return (
          <section id={`tier-${tierName}`} key={tierName} style={{ marginTop: 24 }}>
            <h2
              onClick={() => toggleTier(tierName)}
              style={{
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: "1px solid #ddd",
                paddingBottom: 6,
              }}
              title="Click to collapse/expand"
            >
              <span>
                {tierName} ({stats.done}/{stats.total} • {pct}%)
              </span>
              <span>{collapsed[tierName] ? "▶" : "▼"}</span>
            </h2>

            

            {!collapsed[tierName] && (() => {
                  const sortedList = [...list].sort((a, b) => {
                    if (sortMode === "Default") return 0;

                    const pa = getProgress(a.id);
                    const pb = getProgress(b.id);

                    const aCount = pa?.count ?? 0;
                    const bCount = pb?.count ?? 0;

                    const aDone = a.target != null ? aCount >= a.target : !!pa?.completed;
                    const bDone = b.target != null ? bCount >= b.target : !!pb?.completed;

                    const aPct =
                      a.target != null && a.target > 0
                        ? Math.min(1, aCount / a.target)
                        : aDone
                        ? 1
                        : 0;

                    const bPct =
                      b.target != null && b.target > 0
                        ? Math.min(1, bCount / b.target)
                        : bDone
                        ? 1
                        : 0;

                    if (sortMode === "AZ") return a.name.localeCompare(b.name);

                    if (sortMode === "IncompleteFirst") {
                      if (aDone !== bDone) return aDone ? 1 : -1;
                      return a.name.localeCompare(b.name);
                    }

                    if (sortMode === "MostProgress") {
                      if (bPct !== aPct) return bPct - aPct;
                      return a.name.localeCompare(b.name);
                    }

                    if (sortMode === "LeastProgress") {
                      if (aPct !== bPct) return aPct - bPct;
                      return a.name.localeCompare(b.name);
                    }

                    return 0;
                  });

                  return (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
                        gap: 12,
                      }}
                    >
                      {sortedList.map((a) => {
                        const p = getProgress(a.id);
                        const count = p?.count ?? 0;
                        const target = a.target ?? null;

                        const done = target != null ? count >= target : !!p?.completed;
                        const isExpanded = expandedIds.has(a.id);

                        // If completed, show compact by default; if not completed, show full
                        const compact = done && !isExpanded;

                        const pctRow =
                          target != null && target > 0
                            ? Math.min(100, Math.floor((count / target) * 100))
                            : null;

                        return (
                          <div
                            key={a.id}
                            className={`panel ${done ? "panel--done" : ""}`}
                            style={{
                              padding: compact ? 10 : 12,
                              cursor: done ? "pointer" : "default",
                              opacity: compact ? 0.65 : 1,
                            }}
                            onClick={() => {
                              if (done) toggleExpanded(a.id);
                            }}
                            title={done ? (compact ? "Click to expand" : "Click to collapse") : undefined}
                          >
                            {/* COMPACT ROW (completed + not expanded) */}
                            {compact ? (
                              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                                <div style={{ opacity: 0.85, fontWeight: 800, flex: 1 }}>
                                  ✅ {a.name}
                                </div>

                                {/* show progress badge if it's a counter achievement */}
                                {target != null && (
                                  <div style={{ fontSize: 12, opacity: 0.8, whiteSpace: "nowrap" }}>
                                    {Math.min(count, target)} / {target}
                                  </div>
                                )}

                                <div style={{ fontSize: 12, opacity: 0.75 }}>Hide</div>
                              </div>
                            ) : (
                              /* FULL CARD (incomplete OR expanded completed) */
                              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                                {/* Checkbox or spacer */}
                                {target == null ? (
                                  <input
                                    type="checkbox"
                                    checked={done}
                                    onChange={(e) => setCompleted(a.id, e.target.checked)}
                                    style={{ marginTop: 4 }}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                ) : (
                                  <div style={{ width: 16, height: 16, marginTop: 4, opacity: 0.6 }}>•</div>
                                )}

                                <div style={{ flex: 1 }}>
                                  <div style={{ fontWeight: 800, fontSize: 16 }}>{a.name}</div>
                                  <div style={{ opacity: 0.85, marginTop: 2 }}>{a.description}</div>

                                  {target != null && (
                                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                                      Counter goal: complete at {target}
                                    </div>
                                  )}

                                  {/* Counter UI */}
                                  {target != null && (
                                    <div style={{ marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
                                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                        <label style={{ opacity: 0.9 }}>
                                          Progress:
                                          <input
                                            type="number"
                                            min={0}
                                            value={count}
                                            onChange={(e) => setCount(a.id, Number(e.target.value || 0))}
                                            style={{
                                              marginLeft: 8,
                                              width: 110,
                                              padding: "6px 8px",
                                              borderRadius: 10,
                                              border: "1px solid rgba(78, 222, 243, 0.18)",
                                              background: "rgba(26, 22, 51, 0.65)",
                                              color: "var(--text)",
                                            }}
                                          />
                                          <span style={{ marginLeft: 8, opacity: 0.7 }}>/ {target}</span>
                                        </label>

                                        <span style={{ opacity: 0.75 }}>{pctRow ?? 0}%</span>
                                      </div>

                                      <div
                                        style={{
                                          height: 8,
                                          borderRadius: 999,
                                          background: "rgba(255,255,255,0.08)",
                                          marginTop: 8,
                                          overflow: "hidden",
                                        }}
                                      >
                                        <div
                                          className="progressFill"
                                          style={{ width: `${pctRow ?? 0}%`, height: "100%" }}
                                        />
                                      </div>
                                    </div>
                                  )}

                                  <div style={{ opacity: 0.8, marginTop: 10 }}>
                                    Rewards: {a.rewardsText}
                                  </div>

                                  {done && (
                                    <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
                                      Click card to {isExpanded ? "collapse" : "expand"}
                                    </div>
                                  )}



                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

            

          </section>
        );
      })}

      {showFaq && (
          <div
            className="modalOverlay"
            onClick={closeFaq}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modalHeader">
                <div style={{ fontWeight: 900, fontSize: 18 }}>FAQ / Help</div>
                <button className="button" onClick={closeFaq}>Close</button>
              </div>

              <div className="modalBody">
                <p><b>What is this?</b><br />
                  A static achievements tracker. It runs entirely in your browser.
                </p>

                <p><b>Does it send data anywhere?</b><br />
                  No. Progress is saved locally in your browser (localStorage). No accounts.
                </p>

                <p><b>How do profiles work?</b><br />
                  Profiles are based on the <code>?u=</code> value in the URL. Different <code>?u=</code> means different saved progress.
                </p>

                <p><b>How do I make an alt?</b><br />
                  Use “New Profile” and type an ID, or generate a random one.
                </p>

                <p><b>How do I reset?</b><br />
                  Use “Reset Profile” to clear progress for the current profile ID.
                </p>

                <p><b>Move progress to another device?</b><br />
                  Use Export / Import.
                </p>
              </div>
            </div>
          </div>
      )}


    </div>
  );
}
