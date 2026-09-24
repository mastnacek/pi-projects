// /projects (and /proj) command handler.
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { abbreviateRootOrigin } from "./autocomplete.js";
import { handleRootsSubcommand } from "./command-roots.js";
import { normalizePath, normalizeSortBy, saveCachedProjects, saveProjectsConfig } from "./config.js";
import { createProjectItem } from "./detector.js";
import { refreshProjectsIndex } from "./refresh.js";
import { filterProjects, searchAndRankProjects, sortProjects } from "./scanner.js";
import { projects } from "./state.js";
import {
  goldGlow,
  greenGlow,
  renderHelpBanner,
  renderProjectDetail,
  renderProjectTable,
  renderStatusSummary,
} from "./viewer.js";
import type { ProjectFilterOptions, ProjectSortBy } from "./types.js";

export const handleProjectsCommand = async (
  args: string,
  ctx: ExtensionCommandContext,
) => {
  const trimmed = args.trim();
  // `--global` is accepted as a prefix or a suffix and is stripped here.
  const rawTokens = trimmed.split(/\s+/).filter(Boolean);
  const isGlobal = rawTokens.some((t) => t.toLowerCase() === "--global");
  const tokens = rawTokens.filter((t) => t.toLowerCase() !== "--global");
  const sub = (tokens[0] ?? "").toLowerCase();
  const rest = tokens.slice(1);

  if (!sub || sub === "help" || sub === "-h" || sub === "--help") {
    ctx.ui.notify(renderHelpBanner(), "info");
    return;
  }

  switch (sub) {
    case "tree":
    case "filter":
    case "list":
    case "ls": {
      const filterOptions: ProjectFilterOptions = {};
      let customSort: ProjectSortBy | undefined;
      const textTokens: string[] = [];

      for (const token of rest) {
        const lower = token.toLowerCase();
        if (lower.startsWith("root:") || lower.startsWith("koren:")) {
          filterOptions.root = token.slice(token.indexOf(":") + 1);
        } else if (lower.startsWith("--root=")) {
          filterOptions.root = token.slice(7);
        } else if (lower.startsWith("name:") || lower.startsWith("nazev:")) {
          filterOptions.name = token.slice(token.indexOf(":") + 1);
        } else if (lower.startsWith("--name=")) {
          filterOptions.name = token.slice(7);
        } else if (lower.startsWith("type:") || lower.startsWith("typ:")) {
          filterOptions.type = token.slice(token.indexOf(":") + 1);
        } else if (lower.startsWith("--type=")) {
          filterOptions.type = token.slice(7);
        } else if (lower.startsWith("sort:") || lower.startsWith("razeni:")) {
          customSort = normalizeSortBy(token.slice(token.indexOf(":") + 1));
        } else if (lower.startsWith("--sort=")) {
          customSort = normalizeSortBy(token.slice(7));
        } else if (lower === "--dirty" || lower === "git:dirty") {
          filterOptions.dirtyOnly = true;
        } else if (lower === "--clean" || lower === "git:clean") {
          filterOptions.cleanOnly = true;
        } else if (lower === "--git" || lower === "git:true") {
          filterOptions.gitOnly = true;
        } else {
          const knownTypes = [
            "typescript",
            "node.js",
            "node",
            "python",
            "rust",
            "go",
            "c/c++",
            "c++",
            "c",
            "java/kotlin",
            "java",
            "kotlin",
            ".net/c#",
            ".net",
            "c#",
            "php",
            "ruby",
            "flutter/dart",
            "flutter",
            "dart",
            "swift",
            "git",
            "general",
          ];
          if (!filterOptions.type && knownTypes.includes(lower)) {
            filterOptions.type = lower;
          } else if (
            !filterOptions.root &&
            (projects.config.roots.some((r) =>
              r.toLowerCase().includes(lower),
            ) ||
              projects.index.projects.some(
                (p) =>
                  p.rootPath &&
                  abbreviateRootOrigin(p.rootPath, p.source).toLowerCase() ===
                    lower,
              ))
          ) {
            filterOptions.root = lower;
          } else {
            textTokens.push(token);
          }
        }
      }

      if (textTokens.length > 0) {
        filterOptions.query = textTokens.join(" ");
      }

      filterOptions.sortBy = customSort || projects.config.sortBy || "name";

      const filtered = filterProjects(projects.index.projects, filterOptions);

      const descParts: string[] = [];
      if (filterOptions.root) descParts.push(`kořen: ${filterOptions.root}`);
      if (filterOptions.name) descParts.push(`název: ${filterOptions.name}`);
      if (filterOptions.type) descParts.push(`typ: ${filterOptions.type}`);
      if (filterOptions.query)
        descParts.push(`dotaz: "${filterOptions.query}"`);
      if (filterOptions.dirtyOnly) descParts.push("se změnami 📝");
      if (filterOptions.cleanOnly) descParts.push("čisté ✨");
      if (customSort) descParts.push(`řazeno: ${customSort}`);

      const titleExtra =
        descParts.length > 0 ? descParts.join(", ") : undefined;
      ctx.ui.notify(renderProjectTable(filtered, titleExtra), "info");
      break;
    }

    case "show": {
      const target = rest.join(" ").trim().toLowerCase();
      if (!target) {
        ctx.ui.notify(
          "Zadejte ID nebo název projektu: /projects show <id|název>",
          "warning",
        );
        return;
      }
      const proj = projects.index.projects.find(
        (p) =>
          p.id.toLowerCase() === target ||
          p.name.toLowerCase() === target ||
          p.path.toLowerCase().endsWith(target),
      );
      if (!proj) {
        ctx.ui.notify(
          `Projekt "${target}" nebyl v indexu nalezen.`,
          "warning",
        );
        return;
      }
      ctx.ui.notify(renderProjectDetail(proj), "info");
      break;
    }

    case "sort": {
      const mode = rest[0]?.toLowerCase();
      if (!mode) {
        const sortLabels: Record<string, string> = {
          name: "Abecedně podle názvu (A-Z)",
          root: "Podle kořenové složky",
          mtime: "Podle data poslední změny (nejnovější)",
          type: "Podle technologie / typu",
          files: "Podle počtu souborů",
          git: "Podle Git stavu",
        };
        const currentDesc =
          sortLabels[projects.config.sortBy || "name"] || "Abecedně (A-Z)";
        ctx.ui.notify(
          `Aktuální výchozí řazení: ${goldGlow(currentDesc)}.\nPro změnu zadejte: ${greenGlow("/projects sort [name | root | mtime | type | files | git]")}`,
          "info",
        );
        return;
      }

      const norm = normalizeSortBy(mode);
      projects.config.sortBy = norm;
      saveProjectsConfig(projects.config, isGlobal, ctx.cwd);
      projects.index.projects = sortProjects(projects.index.projects, norm);
      saveCachedProjects(projects.index);

      const labelMap: Record<string, string> = {
        name: "Abecedně podle názvu (A-Z)",
        root: "Podle kořenové složky",
        mtime: "Podle data poslední změny (nejnovější)",
        type: "Podle technologie / typu",
        files: "Podle počtu souborů",
        git: "Podle Git stavu",
      };
      const label = labelMap[norm] || "Abecedně (A-Z)";

      ctx.ui.notify(
        `Výchozí řazení projektů nastaveno na: ${greenGlow(label)}`,
        "info",
      );
      break;
    }

    case "pin":
    case "unpin":
    case "roots": {
      await handleRootsSubcommand(sub, rest, ctx, isGlobal);
      return;
    }

    case "add": {
      const targetPath = rest[0];
      const customName = rest.slice(1).join(" ").trim() || undefined;
      if (!targetPath) {
        ctx.ui.notify(
          "Zadejte cestu k projektu: /projects add <cesta> [název]",
          "warning",
        );
        return;
      }
      const norm = normalizePath(targetPath);
      const item = createProjectItem(norm, undefined, "manual");
      if (!item) {
        ctx.ui.notify(
          `Cesta "${norm}" neexistuje nebo nebyla rozpoznána.`,
          "error",
        );
        return;
      }
      if (customName) item.name = customName;

      const existIdx = projects.config.manualProjects.findIndex(
        (p) => normalizePath(p.path) === norm,
      );
      if (existIdx >= 0) {
        projects.config.manualProjects[existIdx] = item;
      } else {
        projects.config.manualProjects.push(item);
      }
      saveProjectsConfig(projects.config, isGlobal, ctx.cwd);
      await refreshProjectsIndex(undefined, (msg) =>
        ctx.ui.notify(msg, "info"),
      );
      ctx.ui.notify(
        `Projekt ${greenGlow(item.name)} (${item.type}) byl úspěšně přidán!`,
        "info",
      );
      break;
    }

    case "remove":
    case "rm": {
      const target = rest.join(" ").trim().toLowerCase();
      if (!target) {
        ctx.ui.notify(
          "Zadejte ID, název nebo cestu projektu k odebrání: /projects remove <id|cesta>",
          "warning",
        );
        return;
      }

      const normTarget = normalizePath(target);
      const beforeCount = projects.index.projects.length;

      // Remove from manual projects if present
      projects.config.manualProjects = projects.config.manualProjects.filter(
        (p) =>
          p.id.toLowerCase() !== target &&
          p.name.toLowerCase() !== target &&
          normalizePath(p.path) !== normTarget,
      );

      // Add to excluded paths so auto scanner doesn't re-add it
      if (!projects.config.excludedPaths.includes(normTarget)) {
        projects.config.excludedPaths.push(normTarget);
      }

      saveProjectsConfig(projects.config, isGlobal, ctx.cwd);
      await refreshProjectsIndex();
      const afterCount = projects.index.projects.length;

      if (beforeCount === afterCount) {
        ctx.ui.notify(
          `Projekt "${target}" byl zařazen mezi ignorované cesty.`,
          "info",
        );
      } else {
        ctx.ui.notify(`Projekt "${target}" byl odebrán z indexu.`, "info");
      }
      break;
    }

    case "scan":
    case "refresh": {
      ctx.ui.notify(
        "Spouštím skenování kořenových složek projektů...",
        "info",
      );
      await refreshProjectsIndex(undefined, (msg) =>
        ctx.ui.notify(msg, "info"),
      );
      ctx.ui.notify(
        `Skenování dokončeno! Index obsahuje celkem ${greenGlow(String(projects.index.projects.length))} projektů.`,
        "info",
      );
      break;
    }

    case "find":
    case "search": {
      const query = rest.join(" ").trim();
      if (!query) {
        ctx.ui.notify(
          "Zadejte hledaný výraz: /projects search <dotaz> (např. /projects search rust, /projects search scraper)",
          "warning",
        );
        return;
      }
      const ranked = searchAndRankProjects(projects.index.projects, query);
      if (ranked.length === 0) {
        ctx.ui.notify(
          `Pro dotaz "${query}" nebyly nalezeny žádné odpovídající projekty.`,
          "warning",
        );
        return;
      }
      const matched = ranked.map((r) => r.project);
      ctx.ui.notify(
        renderProjectTable(matched, `hledání: "${query}"`),
        "info",
      );
      break;
    }

    case "status": {
      ctx.ui.notify(renderStatusSummary(projects.config, projects.index), "info");
      break;
    }

    default:
      ctx.ui.notify(
        `Neznámý podprogram "${sub}". Zadejte ${greenGlow("/projects help")} pro nápovědu.`,
        "warning",
      );
      break;
  }
};
