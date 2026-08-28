import type {
  ProjectItem,
  ProjectsConfig,
  ProjectsIndex,
  ProjectType,
} from "./types.js";

export const RESET = "\x1b[0m";
export const BOLD = "\x1b[1m";
export const DIM = "\x1b[2m";

export const goldGlow = (s: string) =>
  `\x1b[1m\x1b[38;2;255;215;0m${s}${RESET}`;
export const cyanGlow = (s: string) =>
  `\x1b[1m\x1b[38;2;0;255;255m${s}${RESET}`;
export const greenGlow = (s: string) =>
  `\x1b[1m\x1b[38;2;0;255;127m${s}${RESET}`;
export const pinkGlow = (s: string) =>
  `\x1b[1m\x1b[38;2;255;95;215m${s}${RESET}`;
export const violetGlow = (s: string) =>
  `\x1b[1m\x1b[38;2;186;85;211m${s}${RESET}`;
export const coralGlow = (s: string) =>
  `\x1b[1m\x1b[38;2;255;107;107m${s}${RESET}`;
export const dimGlow = (s: string) => `\x1b[38;2;127;140;141m${s}${RESET}`;

export function renderProjectTypeBadge(type: ProjectType): string {
  switch (type) {
    case "TypeScript":
      return `\x1b[1m\x1b[38;2;49;120;198m[TypeScript]${RESET}`;
    case "Node.js":
      return `\x1b[1m\x1b[38;2;104;160;99m[Node.js]${RESET}`;
    case "Python":
      return `\x1b[1m\x1b[38;2;53;114;165m[Python]${RESET}`;
    case "Rust":
      return `\x1b[1m\x1b[38;2;222;84;25m[Rust]${RESET}`;
    case "Go":
      return `\x1b[1m\x1b[38;2;0;173;216m[Go]${RESET}`;
    case "C/C++":
      return `\x1b[1m\x1b[38;2;243;75;125m[C/C++]${RESET}`;
    case "Java/Kotlin":
      return `\x1b[1m\x1b[38;2;176;114;25m[Java/Kotlin]${RESET}`;
    case ".NET/C#":
      return `\x1b[1m\x1b[38;2;23;145;74m[.NET/C#]${RESET}`;
    case "PHP":
      return `\x1b[1m\x1b[38;2;79;91;147m[PHP]${RESET}`;
    case "Ruby":
      return `\x1b[1m\x1b[38;2;112;21;22m[Ruby]${RESET}`;
    case "Flutter/Dart":
      return `\x1b[1m\x1b[38;2;0;180;235m[Flutter/Dart]${RESET}`;
    case "Swift":
      return `\x1b[1m\x1b[38;2;255;172;51m[Swift]${RESET}`;
    case "Git":
      return `\x1b[1m\x1b[38;2;240;80;50m[Git]${RESET}`;
    default:
      return dimGlow("[General]");
  }
}

function formatDate(timestamp: number): string {
  if (!timestamp) return "-";
  const d = new Date(timestamp);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function renderProjectTable(projects: ProjectItem[]): string {
  if (projects.length === 0) {
    return dimGlow("  (žádné projekty nenalezeny)");
  }

  const lines: string[] = [];
  lines.push(
    ` ${dimGlow("┌─")} ${goldGlow("Seznam projektů")} ${dimGlow(`(${projects.length} položek)`)}`,
  );
  lines.push(
    ` ${dimGlow("│")} ${dimGlow("Git / Název projektu".padEnd(28))} ${dimGlow("Typ".padEnd(16))} ${dimGlow("Git Stav".padEnd(18))} ${dimGlow("Soubory".padEnd(9))} ${dimGlow("Cesta")}`,
  );
  lines.push(` ${dimGlow("├" + "─".repeat(88))}`);

  for (const p of projects) {
    const icon = p.source === "manual" ? "📌" : "📁";
    const gitEmoji = p.git ? `${p.git.statusEmoji} ` : "";
    const namePart = `${icon} ${gitEmoji}${p.name}`.padEnd(28);
    const typePart = renderProjectTypeBadge(p.type).padEnd(25);
    const gitPart = p.git?.statusSummary
      ? cyanGlow(p.git.statusSummary.padEnd(18))
      : dimGlow("-".padEnd(18));
    const filesPart = `${p.fileCount}`.padStart(7).padEnd(9);
    const pathPart = dimGlow(p.relativePath ? `.../${p.relativePath}` : p.path);

    lines.push(
      ` ${dimGlow("│")} ${cyanGlow(namePart)} ${typePart} ${gitPart} ${filesPart} ${pathPart}`,
    );
  }

  lines.push(` ${dimGlow("└" + "─".repeat(88))}`);
  return lines.join("\n");
}

export function renderProjectDetail(p: ProjectItem): string {
  const lines: string[] = [];
  lines.push(
    goldGlow(`═══════════════════════════════════════════════════════════════`),
  );
  const gitIcon = p.git ? `${p.git.statusEmoji} ` : "";
  lines.push(
    `  📁 ${gitIcon}${goldGlow(p.name)}  ${renderProjectTypeBadge(p.type)}  ${p.source === "manual" ? pinkGlow("[Ručně přidáno]") : cyanGlow("[Auto-detekce]")}`,
  );
  lines.push(
    goldGlow(`═══════════════════════════════════════════════════════════════`),
  );
  lines.push(`  ${cyanGlow("ID:")}            ${p.id}`);
  lines.push(`  ${cyanGlow("Cesta:")}         ${p.path}`);
  if (p.rootPath) {
    lines.push(`  ${cyanGlow("Kořen:")}         ${p.rootPath}`);
  }
  if (p.relativePath) {
    lines.push(`  ${cyanGlow("Rel. cesta:")}    ${p.relativePath}`);
  }
  if (p.description) {
    lines.push(`  ${cyanGlow("Popis:")}         ${p.description}`);
  }
  lines.push(`  ${cyanGlow("Značky:")}        ${p.markers.join(", ") || "-"}`);
  lines.push(`  ${cyanGlow("Počet souborů:")} ${p.fileCount}`);
  lines.push(`  ${cyanGlow("Poslední změna:")} ${formatDate(p.lastModified)}`);

  if (p.git) {
    lines.push("");
    lines.push(`  ${goldGlow("Git Informace:")}`);
    lines.push(`    ${cyanGlow("Větev:")}        ${p.git.branch || "HEAD"}`);
    lines.push(
      `    ${cyanGlow("Stav:")}         ${p.git.statusEmoji} ${p.git.clean ? greenGlow("Čistý repozitář") : coralGlow("Obsahuje změny")}`,
    );
    if (p.git.statusSummary) {
      lines.push(`    ${cyanGlow("Přehled:")}      ${p.git.statusSummary}`);
    }
    if ((p.git.modifiedCount ?? 0) > 0) {
      lines.push(
        `    ${cyanGlow("Změněno:")}      ${p.git.modifiedCount} souborů (📝)`,
      );
    }
    if ((p.git.stagedCount ?? 0) > 0) {
      lines.push(
        `    ${cyanGlow("Staged:")}       ${p.git.stagedCount} souborů (➕)`,
      );
    }
    if ((p.git.untrackedCount ?? 0) > 0) {
      lines.push(
        `    ${cyanGlow("Nesledováno:")}  ${p.git.untrackedCount} souborů (❓)`,
      );
    }
    if ((p.git.aheadCount ?? 0) > 0) {
      lines.push(
        `    ${cyanGlow("Neodesláno:")}   ${p.git.aheadCount} commitů (🚀 ahead)`,
      );
    }
    if ((p.git.behindCount ?? 0) > 0) {
      lines.push(
        `    ${cyanGlow("Ke stažení:")}   ${p.git.behindCount} commitů (📥 behind)`,
      );
    }
  }

  lines.push(
    goldGlow(`═══════════════════════════════════════════════════════════════`),
  );

  return lines.join("\n");
}

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

  const sortDesc =
    config.sortBy === "mtime" || config.sortBy === "date"
      ? "Podle data změny (nejnovější)"
      : "Abecedně (A-Z)";

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
    `  ${greenGlow("/projects list")}                  — Zobrazit přehlednou tabulku všech projektů a Git stavů`,
    `  ${greenGlow("/projects show <id|název>")}       — Zobrazit detail projektu včetně kompletní Git diagnostiky`,
    `  ${greenGlow("/projects sort [name|mtime]")}     — Nastavit výchozí řazení (name = abecedně, mtime = podle data)`,
    `  ${greenGlow("/projects add <cesta> [název]")}   — Ručně přidat projekt do indexu`,
    `  ${greenGlow("/projects remove <id|cesta>")}     — Odebrat projekt z indexu`,
    `  ${greenGlow("/projects roots")}                 — Zobrazit seznam kořenových složek`,
    `  ${greenGlow("/projects roots add <cesta>")}     — Přidat novou kořenovou složku pro skenování`,
    `  ${greenGlow("/projects roots remove <cesta>")}  — Odebrat kořenovou složku`,
    `  ${greenGlow("/projects scan")}                  — Spustit okamžité přegenerování indexu a Git stavů`,
    `  ${greenGlow("/projects search <dotaz>")}        — Vyhledávat v projektech podle názvu či cesty`,
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
