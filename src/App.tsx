import { useEffect, useMemo, useRef, useState } from "react";
import achievementsData from "./data/achievements.json";
import type { Achievement, ProgressFileV1, Tier } from "./types/achievements";
import { loadProgress, saveProgress } from "./lib/storage";
import { TAG_OVERRIDES } from "./data/tagOverrides";


const ALL_TIERS: Tier[] = [
  "Starter",
  "Apprentice",
  "Adept",
  "Expert",
  "Master",
  "Grandmaster",
  "Heroic",
];

type Tag =
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

const ALL_TAGS: Tag[] = [
  "Clues",
  "Voting",
  "World Boss",
  "Slayer",
  "Bosses",
  "Chests",
  "Collection Log",
  "Prestige",
  "Skills",
  "Events",
  "Gear",
];




function inferTags(a: { name: string; description: string; rewardsText: string }): Tag[] {
  const text = `${a.name} ${a.description} ${a.rewardsText}`.toLowerCase();
  const tags: Tag[] = [];
  const has = (re: RegExp) => re.test(text);

  // --- Clues (more specific to reduce false positives) ---
  if (has(/\bclue scroll\b|\bclues?\b(?!\s*token)|\bcasket\b|\bmimic\b/)) tags.push("Clues");

  // --- Voting (prefer commands / explicit voting terms) ---
  if (has(/::vote\b|claimvotes\b|\bvoting\b|\bvote points?\b/)) tags.push("Voting");

  // --- World Boss ---
  if (has(/\bworld boss\b|::wb\b/)) tags.push("World Boss");

  // --- Slayer ---
  if (has(/\bslayer\b|\bsuperior\b|\bslayer task(s)?\b/)) tags.push("Slayer");

  // --- Bosses (explicit boss list; avoid generic "boss" tagging) ---
  if (
    has(
      /\bkill\b.*\b(jad|giant mole|obor|bryophyta|graardor|zilyana|kree|k'ril|kril|cerberus|kraken|thermonuclear|barrows|scurrius|zebak|kephri|baba|akkha|nex|warden|alchemical hydra|maiden|bloat|nylocas|sotetseg|xarpus|verzik|yama|ignis|danger snek|olympian|azrael|theatre)\b|\b(godwars|gwd|theatre|tob)\b/
    )
  ) {
    tags.push("Bosses");
  }

  // --- Chests ---
  if (has(/\btoa common chest\b|\btoa purple chest\b|\bcrystal chest\b|\bethereal chest\b|\bgiant chest\b|\bchest\b(?!plate)/))
    tags.push("Chests");

  // --- Collection Log / Prestige / Events ---
  if (has(/\bcollection log\b/)) tags.push("Collection Log");
  if (has(/\bprestige\b/)) tags.push("Prestige");
  if (has(/\brandom event\b|\btrivia\b|\bevent(s)?\b/)) tags.push("Events");

  // --- Skills ---
  if (
    has(
      /\b(mining|woodcutting|fishing|thieving|crafting|smithing|fletching|herblore|prayer|agility|runecraft(ing)?)\b/
    )
  ) {
    tags.push("Skills");
  }

  // --- Gear (add Temper) ---
  if (
    has(
      /\bequip\b|\b(armou?r|boots|helm(et)?|platebody|platelegs|legs|gloves|shield|staff|bow|crossbow|cape|temper)\b/
    )
  ) {
    tags.push("Gear");
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
      const u = new URLSearchParams(window.location.search).get("u");
      return u && u.trim() ? u.trim().toLowerCase() : "default";
    }, []);

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




    const [progressFile, setProgressFile] = useState<ProgressFileV1>(() =>
      loadProgress(userKey)
    );


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
            const tags = new Set((a as any).tags ?? []);
            let ok = false;
            for (const t of selectedTags) {
            if (tags.has(t)) { ok = true; break; }
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
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
      <h1 style={{ marginBottom: 6 }}>Paragon League Achievements Tracker</h1>
      <p style={{ marginTop: 0, opacity: 0.8 }}>
        Saved locally in your browser. Completed: {completedCount} / {totalCount}
      </p>

      {/* Controls */}
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          padding: 12,
          border: "1px solid #eee",
          borderRadius: 12,
          marginTop: 12,
        }}
      >
        <input
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

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
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
                type="checkbox"
                checked={selectedTags.has(tag)}
                onChange={() => toggleTag(tag)}
              />
              {tag}
            </label>
          ))}

          <button onClick={clearTags} style={{ padding: "6px 10px" }}>
            Clear tags
          </button>
        </div>


        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={exportProgress} style={{ padding: "8px 10px" }}>
            Export
          </button>

          <button onClick={openImportPicker} style={{ padding: "8px 10px" }}>
            Import
          </button>

          <button onClick={expandAll} style={{ padding: "8px 10px" }}>
            Expand all
          </button>

          <button onClick={collapseAll} style={{ padding: "8px 10px" }}>
            Collapse all
          </button>

          <button
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.set("u", userKey);
                navigator.clipboard.writeText(url.toString());
                alert("Link copied!");
              }}
              style={{ padding: "8px 10px" }}
            >
              Copy my link
          </button>

          



          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportFile(f);
              e.currentTarget.value = ""; // allow re-import same file
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

      {/* List */}
      {grouped.map(([tierName, list]) => {
        const stats = tierStats(tierName, achievements, progressFile);
        const pct =
          stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

        return (
          <section key={tierName} style={{ marginTop: 24 }}>
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

            {!collapsed[tierName] && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {list.map((a) => {
                  const p = getProgress(a.id);
                  const count = p?.count ?? 0;
                  const target = a.target ?? null;

                  const done = target != null ? count >= target : !!p?.completed;

                  const pctRow =
                    target != null && target > 0
                      ? Math.min(100, Math.floor((count / target) * 100))
                      : null;

                  return (
                    <div
                      key={a.id}
                      style={{
                        padding: 12,
                        border: "1px solid #eee",
                        borderRadius: 12,
                        opacity: done ? 0.75 : 1,
                      }}
                    >
                      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                        {/* Checkbox or spacer */}
                        {target == null ? (
                          <input
                            type="checkbox"
                            checked={done}
                            onChange={(e) => setCompleted(a.id, e.target.checked)}
                            style={{ marginTop: 4 }}
                          />
                        ) : (
                          <div style={{ width: 16, height: 16, marginTop: 4, opacity: 0.6 }}>
                            •
                          </div>
                        )}

                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800 }}>{a.name}</div>
                          <div style={{ opacity: 0.85 }}>{a.description}</div>

                          {target != null && (
                            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
                              Counter goal: complete at {target}
                            </div>
                          )}

                          {/* Counter UI */}
                          {target != null && (
                            <div style={{ marginTop: 10 }}>
                              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                <label style={{ opacity: 0.8 }}>
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
                                      border: "1px solid #ddd",
                                    }}
                                  />
                                  <span style={{ marginLeft: 8, opacity: 0.7 }}>/ {target}</span>
                                </label>

                                <span style={{ opacity: 0.7 }}>{pctRow ?? 0}%</span>
                              </div>

                              <div
                                style={{
                                  height: 8,
                                  borderRadius: 999,
                                  background: "#eee",
                                  marginTop: 8,
                                  overflow: "hidden",
                                }}
                              >
                                <div
                                  style={{
                                    height: "100%",
                                    width: `${pctRow ?? 0}%`,
                                    background: "#999",
                                  }}
                                />
                              </div>
                            </div>
                          )}

                          <div style={{ opacity: 0.7, marginTop: 10 }}>
                            Rewards: {a.rewardsText}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </section>
        );
      })}
    </div>
  );
}
