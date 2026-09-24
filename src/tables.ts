// Extracted from viewer.ts to keep modules focused.



import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
	RESET,
	coralGlow,
	cyanGlow,
	dimGlow,
	goldGlow,
	greenGlow,
	pinkGlow,
	violetGlow,
} from "./theme.js";
import {
	buildProjectTree,
	flattenTreeToRows,
	getTreePrefix,
	padVisible,
} from "./tree.js";
import {
	ProjectItem,
	ProjectType,
} from "./types.js";
import {
	abbreviateRootOrigin,
} from "./autocomplete.js";

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

export function formatDate(timestamp: number): string {
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
