import type {
  ProjectItem,
  ProjectsConfig,
  ProjectsIndex,
  ProjectType,
} from "./types.js";
import { abbreviateRootOrigin } from "./autocomplete.js";
import { normalizePath } from "./config.js";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

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

export interface ProjectTreeNode {
  name: string;
  segment: string;
  path: string;
  relativePath?: string;
  rootPath?: string;
  source: "auto" | "manual";
  isProject: boolean;
  project?: ProjectItem;
  subprojectCount: number;
  totalFileCount: number;
  hasChanges: boolean;
  minOriginalIndex: number;
  children: ProjectTreeNode[];
}

interface RawTreeNode {
  segment: string;
  fullRelativePath: string;
  fullPath: string;
  rootPath?: string;
  source: "auto" | "manual";
  project?: ProjectItem;
  originalIndex?: number;
  children: Map<string, RawTreeNode>;
}

function convertAndCompactRawNode(raw: RawTreeNode): ProjectTreeNode {
  let curr = raw;
  let combinedSegment = curr.segment;
  let combinedRelPath = curr.fullRelativePath;
  let combinedFullPath = curr.fullPath;

  // Compact chain of single-child directories if curr is not a project
  // and its only child is also not a project
  while (!curr.project && curr.children.size === 1) {
    const onlyChild = Array.from(curr.children.values())[0];
    if (!onlyChild || onlyChild.project) {
      break;
    }
    combinedSegment = combinedSegment
      ? `${combinedSegment}/${onlyChild.segment}`
      : onlyChild.segment;
    combinedRelPath = onlyChild.fullRelativePath;
    combinedFullPath = onlyChild.fullPath;
    curr = onlyChild;
  }

  const convertedChildren = Array.from(curr.children.values()).map((child) =>
    convertAndCompactRawNode(child),
  );

  // Sort children by minOriginalIndex to preserve the active sort order
  convertedChildren.sort((a, b) => a.minOriginalIndex - b.minOriginalIndex);

  let subprojectCount = curr.project ? 1 : 0;
  let totalFileCount = curr.project ? curr.project.fileCount : 0;
  let hasChanges = Boolean(curr.project?.git && !curr.project.git.clean);
  let minOriginalIndex = curr.originalIndex ?? Number.MAX_SAFE_INTEGER;

  for (const child of convertedChildren) {
    subprojectCount += child.subprojectCount;
    totalFileCount += child.totalFileCount;
    if (child.hasChanges) {
      hasChanges = true;
    }
    if (child.minOriginalIndex < minOriginalIndex) {
      minOriginalIndex = child.minOriginalIndex;
    }
  }

  const name = curr.project ? curr.project.name : combinedSegment;

  return {
    name,
    segment: combinedSegment,
    path: combinedFullPath,
    relativePath: combinedRelPath || undefined,
    rootPath: curr.project?.rootPath ?? curr.rootPath,
    source: curr.project?.source ?? curr.source,
    isProject: Boolean(curr.project),
    project: curr.project,
    subprojectCount,
    totalFileCount,
    hasChanges,
    minOriginalIndex,
    children: convertedChildren,
  };
}

export function buildProjectTree(projects: ProjectItem[]): ProjectTreeNode[] {
  if (projects.length === 0) return [];

  // Group by root to keep root trees together
  const rootGroups = new Map<
    string,
    Array<{ project: ProjectItem; originalIndex: number }>
  >();

  for (let idx = 0; idx < projects.length; idx++) {
    const p = projects[idx];
    if (!p) continue;
    let rootKey = "__default__";
    if (p.rootPath) {
      rootKey = normalizePath(p.rootPath);
    } else if (p.source === "manual") {
      rootKey = "__manual__";
    }

    const group = rootGroups.get(rootKey) ?? [];
    group.push({ project: p, originalIndex: idx });
    rootGroups.set(rootKey, group);
  }

  const resultRoots: ProjectTreeNode[] = [];

  for (const [rootKey, groupItems] of rootGroups.entries()) {
    const isManualGroup = rootKey === "__manual__";
    let groupRootPath: string | undefined;
    if (!isManualGroup && rootKey !== "__default__") {
      groupRootPath = rootKey;
    }

    const rawRoot: RawTreeNode = {
      segment: "",
      fullRelativePath: "",
      fullPath: groupRootPath || "",
      rootPath: groupRootPath,
      source: isManualGroup ? "manual" : "auto",
      children: new Map(),
    };

    for (const { project: p, originalIndex } of groupItems) {
      const normPath = normalizePath(p.path);
      let rel = p.relativePath
        ? p.relativePath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")
        : "";

      if (!rel && p.rootPath) {
        const normRoot = normalizePath(p.rootPath);
        if (normPath.startsWith(normRoot)) {
          rel = normPath.slice(normRoot.length).replace(/^\/+|\/+$/g, "");
        }
      }

      let segments: string[];
      if (rel) {
        segments = rel.split("/").filter(Boolean);
      } else {
        segments = [p.name];
      }

      let current = rawRoot;
      let currRel = "";
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (!seg) continue;
        currRel = currRel ? `${currRel}/${seg}` : seg;
        let child = current.children.get(seg);
        if (!child) {
          const childFullPath = groupRootPath
            ? `${groupRootPath}/${currRel}`
            : normPath;
          child = {
            segment: seg,
            fullRelativePath: currRel,
            fullPath: childFullPath,
            rootPath: p.rootPath,
            source: p.source,
            children: new Map(),
          };
          current.children.set(seg, child);
        }
        if (i === segments.length - 1) {
          child.project = p;
          child.originalIndex = originalIndex;
        }
        current = child;
      }
    }

    const treeChildren = Array.from(rawRoot.children.values()).map((rawChild) =>
      convertAndCompactRawNode(rawChild),
    );

    treeChildren.sort((a, b) => a.minOriginalIndex - b.minOriginalIndex);
    resultRoots.push(...treeChildren);
  }

  resultRoots.sort((a, b) => a.minOriginalIndex - b.minOriginalIndex);
  return resultRoots;
}

export interface FlattenedTreeRow {
  node: ProjectTreeNode;
  isLastStack: boolean[];
}

export function flattenTreeToRows(
  nodes: ProjectTreeNode[],
  ancestorIsLastStack: boolean[] = [],
  isTopLevel = true,
): FlattenedTreeRow[] {
  const rows: FlattenedTreeRow[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node) continue;
    const isLastChild = i === nodes.length - 1;
    const rowStack = isTopLevel ? [] : [...ancestorIsLastStack, isLastChild];

    rows.push({
      node,
      isLastStack: rowStack,
    });

    if (node.children.length > 0) {
      const nextAncestorStack = isTopLevel
        ? []
        : [...ancestorIsLastStack, isLastChild];
      rows.push(...flattenTreeToRows(node.children, nextAncestorStack, false));
    }
  }

  return rows;
}

export function getTreePrefix(isLastStack: boolean[]): string {
  if (isLastStack.length === 0) return "";
  let prefix = "";
  for (let i = 0; i < isLastStack.length - 1; i++) {
    prefix += isLastStack[i] ? "    " : "│   ";
  }
  prefix += isLastStack[isLastStack.length - 1] ? "└── " : "├── ";
  return prefix;
}

export function padVisible(
  str: string,
  width: number,
  align: "left" | "right" = "left",
): string {
  const vWidth = visibleWidth(str);
  if (vWidth >= width) {
    return vWidth === width ? str : truncateToWidth(str, width);
  }
  const diff = width - vWidth;
  const padding = " ".repeat(diff);
  return align === "right" ? padding + str : str + padding;
}

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

export function renderProjectTable(
  projects: ProjectItem[],
  titleExtra?: string,
): string {
  const colWidths = {
    name: 28,
    root: 12,
    type: 15,
    git: 20,
    files: 8,
  };

  const headerCols = [
    padVisible("Git / Název projektu", colWidths.name),
    padVisible("Kořen", colWidths.root),
    padVisible("Typ", colWidths.type),
    padVisible("Git Stav", colWidths.git),
    padVisible("Soubory", colWidths.files, "right"),
    "Cesta",
  ];

  const headerLine = ` │ ${dimGlow(headerCols[0])} ${dimGlow(headerCols[1])} ${dimGlow(headerCols[2])} ${dimGlow(headerCols[3])} ${dimGlow(headerCols[4])} ${dimGlow(headerCols[5])}`;
  const headerVisible =
    3 +
    colWidths.name +
    1 +
    colWidths.root +
    1 +
    colWidths.type +
    1 +
    colWidths.git +
    1 +
    colWidths.files +
    1 +
    35;

  if (projects.length === 0) {
    const emptyCount = titleExtra
      ? `(0 položek — ${titleExtra})`
      : `(0 položek)`;
    const topBarLen = Math.max(
      2,
      headerVisible - 20 - visibleWidth(emptyCount),
    );
    return [
      ` ${dimGlow("┌─")} ${goldGlow("Seznam projektů")} ${dimGlow(emptyCount)} ${dimGlow("─".repeat(topBarLen))}`,
      headerLine,
      ` ${dimGlow("├" + "─".repeat(headerVisible))}`,
      ` ${dimGlow("│")} ${dimGlow("  (žádné projekty neodpovídají zadaným kritériím)")}`,
      ` ${dimGlow("└" + "─".repeat(headerVisible))}`,
    ].join("\n");
  }

  const countStr = titleExtra
    ? `(${projects.length} položek — ${titleExtra})`
    : `(${projects.length} položek)`;

  const lines: string[] = [];
  const topBarLen = Math.max(2, headerVisible - 20 - visibleWidth(countStr));
  lines.push(
    ` ${dimGlow("┌─")} ${goldGlow("Seznam projektů")} ${dimGlow(countStr)} ${dimGlow("─".repeat(topBarLen))}`,
  );
  lines.push(headerLine);
  lines.push(` ${dimGlow("├" + "─".repeat(headerVisible))}`);

  const treeNodes = buildProjectTree(projects);
  const flattenedRows = flattenTreeToRows(treeNodes);

  for (const { node, isLastStack } of flattenedRows) {
    const treePrefix = getTreePrefix(isLastStack);

    if (node.isProject && node.project) {
      const p = node.project;
      const icon = p.pinned ? "📌" : p.source === "manual" ? "📎" : "📁";
      const gitEmoji = p.git ? `${p.git.statusEmoji} ` : "";
      const rawName = `${treePrefix}${icon} ${gitEmoji}${p.name}`;
      const truncatedName = truncateToWidth(rawName, colWidths.name);
      const namePart = padVisible(
        p.pinned ? goldGlow(truncatedName) : cyanGlow(truncatedName),
        colWidths.name,
      );

      const rootAbbrev = `[${abbreviateRootOrigin(p.rootPath, p.source)}]`;
      const rootPart = padVisible(violetGlow(rootAbbrev), colWidths.root);

      const typeBadge = renderProjectTypeBadge(p.type);
      const typePart = padVisible(typeBadge, colWidths.type);

      let gitSummary = dimGlow("-");
      if (p.git?.statusSummary) {
        gitSummary = p.git.clean
          ? greenGlow(p.git.statusSummary)
          : coralGlow(p.git.statusSummary);
      }
      const gitPart = padVisible(gitSummary, colWidths.git);

      const filesPart = padVisible(
        String(p.fileCount),
        colWidths.files,
        "right",
      );
      const pathPart = dimGlow(
        p.relativePath ? `.../${p.relativePath}` : p.path,
      );

      lines.push(
        ` ${dimGlow("│")} ${namePart} ${rootPart} ${typePart} ${gitPart} ${filesPart} ${pathPart}`,
      );
    } else {
      // Folder node containing subprojects
      const rawName = `${treePrefix}📁 ${node.name}/`;
      const truncatedName = truncateToWidth(rawName, colWidths.name);
      const namePart = padVisible(goldGlow(truncatedName), colWidths.name);

      const rootAbbrev = `[${abbreviateRootOrigin(node.rootPath, node.source)}]`;
      const rootPart = padVisible(dimGlow(rootAbbrev), colWidths.root);

      const typeBadge = dimGlow(`(${node.subprojectCount} proj)`);
      const typePart = padVisible(typeBadge, colWidths.type);

      const gitSummary = node.hasChanges ? coralGlow("změny 📝") : dimGlow("─");
      const gitPart = padVisible(gitSummary, colWidths.git);

      const filesPart = padVisible(
        String(node.totalFileCount),
        colWidths.files,
        "right",
      );
      const pathPart = dimGlow(
        node.relativePath ? `.../${node.relativePath}` : node.path,
      );

      lines.push(
        ` ${dimGlow("│")} ${namePart} ${rootPart} ${typePart} ${gitPart} ${filesPart} ${pathPart}`,
      );
    }
  }

  lines.push(` ${dimGlow("└" + "─".repeat(headerVisible))}`);
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
    const shortRoot = abbreviateRootOrigin(p.rootPath, p.source);
    lines.push(
      `  ${cyanGlow("Kořen:")}         ${p.rootPath} ${violetGlow(`[${shortRoot}]`)}`,
    );
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
