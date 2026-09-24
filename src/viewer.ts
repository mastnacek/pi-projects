import type {
  ProjectItem,
  ProjectsConfig,
  ProjectsIndex,
  ProjectType,
} from "./types.js";



import { abbreviateRootOrigin } from "./autocomplete.js";



import { normalizePath } from "./config.js";



import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";


import { RESET, BOLD, DIM, goldGlow, cyanGlow, greenGlow, pinkGlow, violetGlow, coralGlow, dimGlow } from "./theme.js";

import { ProjectTreeNode, RawTreeNode, convertAndCompactRawNode, buildProjectTree, FlattenedTreeRow, flattenTreeToRows, getTreePrefix, padVisible } from "./tree.js";
import { renderProjectTypeBadge, formatDate, renderProjectTable, renderProjectDetail } from "./tables.js";

// Re-exported so existing consumers can keep importing from this module.
// Re-exported so existing consumers can keep importing from this module.
// Re-exported so existing consumers can keep importing from this module.
export * from "./theme.js";
export * from "./tree.js";
export * from "./tables.js";

export function renderRootsTable(
  roots: string[],
  projects: ProjectItem[],
): string {
  const lines: string[] = [];
  lines.push(
    ` ${dimGlow("┌─")} ${goldGlow("Konfigurované kořenové složky pro skenování")}`,
  );
  lines.push(
    ` ${dimGlow("│")} ${dimGlow("Poř.".padEnd(6))} ${dimGlow("Nalezeno".padEnd(10))} ${dimGlow("Cesta")}`,
  );
  lines.push(` ${dimGlow("├" + "─".repeat(70))}`);

  if (roots.length === 0) {
    lines.push(
      ` ${dimGlow("│")} ${dimGlow("(žádné kořenové složky nenastaveny)")}`,
    );
  } else {
    roots.forEach((root, idx) => {
      const count = projects.filter(
        (p) => p.rootPath === root || p.path.startsWith(root),
      ).length;
      const num = `#${idx + 1}`.padEnd(6);
      const countStr = `${count} proj`.padEnd(10);
      lines.push(
        ` ${dimGlow("│")} ${num} ${greenGlow(countStr)} ${cyanGlow(root)}`,
      );
    });
  }

  lines.push(` ${dimGlow("└" + "─".repeat(70))}`);
  return lines.join("\n");
}

function getSortDescription(sortBy?: string): string {
  switch (sortBy) {
    case "root":
      return "Podle kořenové složky";
    case "mtime":
    case "date":
      return "Podle data změny (nejnovější)";
    case "type":
      return "Podle technologie / typu";
    case "files":
      return "Podle počtu souborů";
    case "git":
      return "Podle Git stavu";
    default:
      return "Abecedně podle názvu (A-Z)";
  }
}

export function renderStatusSummary(
  config: ProjectsConfig,
  index: ProjectsIndex,
): string {
  const total = index.projects.length;
  const autoCount = index.projects.filter((p) => p.source === "auto").length;
  const manualCount = index.projects.filter(
    (p) => p.source === "manual",
  ).length;

  const typeCounts = new Map<string, number>();
  let gitCount = 0;
  let cleanGitCount = 0;
  let dirtyGitCount = 0;

  for (const p of index.projects) {
    typeCounts.set(p.type, (typeCounts.get(p.type) ?? 0) + 1);
    if (p.git) {
      gitCount++;
      if (p.git.clean) cleanGitCount++;
      else dirtyGitCount++;
    }
  }

  const typeSummary = Array.from(typeCounts.entries())
    .map(([t, c]) => `${t}: ${c}`)
    .join(" | ");

  const sortDesc = getSortDescription(config.sortBy);

  const lines: string[] = [
    goldGlow(`⚡ pi-projects — Přehled stavu indexu projektů`),
    "",
    `  ${cyanGlow("Celkem projektů:")}     ${goldGlow(String(total))} (${autoCount} detekováno, ${manualCount} ručně)`,
    `  ${cyanGlow("Kořenové složky:")}     ${config.roots.length} (${config.roots.join(", ") || "-"})`,
    `  ${cyanGlow("Hloubka prohledávání:")} ${config.maxDepth} úrovní`,
    `  ${cyanGlow("Výchozí řazení:")}      ${goldGlow(sortDesc)}`,
    `  ${cyanGlow("Git repozitáře:")}      ${gitCount} celkem (${greenGlow(`${cleanGitCount} čistých ✨`)}, ${coralGlow(`${dirtyGitCount} se změnami 📝`)})`,
    `  ${cyanGlow("@ našeptávání:")}        ${config.prependToAtAutocomplete ? greenGlow("Aktivní") : coralGlow("Vypnuto")}`,
    `  ${cyanGlow("Poslední aktualizace:")} ${formatDate(index.lastUpdated)}`,
    "",
    `  ${cyanGlow("Zastoupené technologie:")}`,
    `  ${dimGlow(typeSummary || "(žádné)")}`,
  ];

  return lines.join("\n");
}

export function renderHelpBanner(): string {
  return [
    goldGlow(
      `╔══════════════════════════════════════════════════════════════════════╗`,
    ),
    goldGlow(
      `║  📁 pi-projects — Inteligentní správce a @-našeptávač projektů      ║`,
    ),
    goldGlow(
      `╚══════════════════════════════════════════════════════════════════════╝`,
    ),
    `Automaticky rozpoznává projekty (Node/TS, Python, Rust, Go, C++, Git a další)`,
    `z neomezeného počtu kořenových složek a podsložek. Při psaní ${greenGlow("@")} v editoru`,
    `předsadí nalezené projekty na začátek nabídky včetně stavových Git emotikonů.`,
    "",
    cyanGlow(`Příkazy rozhraní (/projects nebo /proj):`),
    `  ${greenGlow("/projects list [filtry]")}          — Zobrazit tabulku projektů (filtry: root:X, name:Y, type:Z)`,
    `  ${greenGlow("/projects show <id|název>")}       — Zobrazit detail projektu včetně kompletní Git diagnostiky`,
    `  ${greenGlow("/projects sort [name|root|mtime|type|files]")} — Nastavit výchozí řazení projektů`,
    `  ${greenGlow("/projects search <dotaz>")}        — Vyhledávat v projektech (název, cesta, technologie, značky)`,
    `  ${greenGlow("/projects pin/unpin <id|název>")}  — Připnout / odepnout oblíbený projekt na začátek`,
    `  ${greenGlow("/projects add <cesta> [název]")}   — Ručně přidat projekt do indexu`,
    `  ${greenGlow("/projects remove <id|cesta>")}     — Odebrat projekt z indexu`,
    `  ${greenGlow("/projects roots")}                 — Zobrazit seznam kořenových složek`,
    `  ${greenGlow("/projects roots add <cesta>")}     — Přidat novou kořenovou složku pro skenování`,
    `  ${greenGlow("/projects roots remove <cesta>")}  — Odebrat kořenovou složku`,
    `  ${greenGlow("/projects scan")}                  — Spustit okamžité přegenerování indexu a Git stavů`,
    `  ${greenGlow("/projects status")}                — Zobrazit statistiky indexu a Git stavu`,
    `  ${greenGlow("/projects help")}                  — Zobrazit tuto nápovědu v češtině`,
    "",
    goldGlow(`Git Stavové Emotikony:`),
    `  ${greenGlow("✨")} Čistý repozitář (up-to-date)`,
    `  ${coralGlow("📝")} Změněné / neuložené soubory (modified)`,
    `  ${greenGlow("➕")} Připravené změny ke commitu (staged)`,
    `  ${dimGlow("❓")} Nové nesledované soubory (untracked)`,
    `  ${violetGlow("🚀")} Neodeslané commity na server (ahead)`,
    `  ${cyanGlow("📥")} Nové commity na vzdáleném serveru (behind)`,
    `  ${pinkGlow("⚡")} Rozvětvení / divergence (ahead & behind)`,
    "",
    dimGlow(
      `Tip: Napište @ v editoru — projekty se nabídnou se stavem Git repozitáře!`,
    ),
  ].join("\n");
}
