import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import {
  loadCachedProjects,
  loadProjectsConfig,
  normalizePath,
  normalizeSortBy,
  saveCachedProjects,
  saveProjectsConfig,
} from "./src/config.js";
import { createProjectItem } from "./src/detector.js";
import {
  filterProjects,
  scanAllRoots,
  searchAndRankProjects,
  sortProjects,
} from "./src/scanner.js";
import {
  abbreviateRootOrigin,
  createProjectsAutocompleteProvider,
} from "./src/autocomplete.js";
import {
  coralGlow,
  goldGlow,
  greenGlow,
  renderHelpBanner,
  renderProjectDetail,
  renderProjectTable,
  renderRootsTable,
  renderStatusSummary,
} from "./src/viewer.js";
import type {
  ProjectFilterOptions,
  ProjectsConfig,
  ProjectsIndex,
  ProjectSortBy,
} from "./src/types.js";

const SUBCOMMANDS_DOCS: Record<string, string> = {
  list: "zobrazit tabulku projektů (filtry: root:X, name:Y, type:Z, sort:W)",
  filter: "filtrovat projekty podle kořene, názvu či technologie",
  show: "zobrazit detail projektu podle ID či názvu",
  sort: "nastavit výchozí řazení (name | root | mtime | type | files | git)",
  search: "vyhledávat v projektech podle dotazu",
  pin: "připnout oblíbený projekt nahoru (<id|název>)",
  unpin: "odepnout projekt (<id|název>)",
  add: "ručně přidat projekt do indexu (<cesta> [název])",
  remove: "odebrat projekt z indexu (<id|cesta>)",
  roots: "správa kořenových složek pro skenování (list | add | remove)",
  scan: "spustit okamžité přegenerování indexu projektů",
  status: "zobrazit statistiky indexu a stav @-našeptávání",
  help: "zobrazit podrobnou nápovědu v češtině",
};

let currentConfig: ProjectsConfig = loadProjectsConfig();
let currentIndex: ProjectsIndex = loadCachedProjects() || {
  projects: [],
  lastUpdated: 0,
  rootsScanned: [],
};

let isScanning = false;

async function refreshProjectsIndex(
  signal?: AbortSignal,
  notifyCb?: (msg: string) => void,
): Promise<ProjectsIndex> {
  if (isScanning) return currentIndex;
  isScanning = true;

  try {
    const updated = await scanAllRoots(currentConfig, signal);
    currentIndex = updated;
    currentConfig.lastScanTime = updated.lastUpdated;
    saveProjectsConfig(currentConfig);
    saveCachedProjects(updated);
    if (notifyCb) {
      notifyCb(
        `Index aktualizován: nalezeno ${updated.projects.length} projektů`,
      );
    }
    return updated;
  } finally {
    isScanning = false;
  }
}

export default function (pi: ExtensionAPI): void {
  // 1. Session start & Autocomplete provider hook
  pi.on("session_start", async (_event, ctx: ExtensionContext) => {
    currentConfig = loadProjectsConfig();
    const cached = loadCachedProjects();
    if (cached) {
      currentIndex = cached;
    }

    if (ctx.hasUI) {
      ctx.ui.setStatus(
        "pi-projects",
        `📁 ${currentIndex.projects.length} proj`,
      );

      // Register @-autocomplete provider
      ctx.ui.addAutocompleteProvider((current) =>
        createProjectsAutocompleteProvider(
          current,
          () => currentIndex.projects,
          () => currentConfig.prependToAtAutocomplete,
          () => currentConfig.sortBy || "name",
        ),
      );
    }

    // Trigger background rescan if cache empty or stale (> 30 min)
    const now = Date.now();
    const staleThreshold =
      (currentConfig.rescanIntervalMinutes || 30) * 60 * 1000;
    if (
      currentIndex.projects.length === 0 ||
      now - currentIndex.lastUpdated > staleThreshold
    ) {
      void refreshProjectsIndex(undefined, () => {
        if (ctx.hasUI) {
          ctx.ui.setStatus(
            "pi-projects",
            `📁 ${currentIndex.projects.length} proj`,
          );
        }
      });
    }
  });

  // 2. Custom tools for Agent
  pi.registerTool({
    name: "list_projects",
    label: "List Projects",
    description:
      "Vrátí seznam všech detekovaných i ručně přidaných projektů z kořenových složek s možností filtrování podle kořene, názvu a technologie a volitelným řazením.",
    promptSnippet:
      "Použij list_projects pro získání přehledu projektů s možností filtrování podle kořenové složky, názvu či technologie.",
    promptGuidelines: [
      "Volej list_projects když uživatel hledá projekty nebo chce prozkoumat workspace.",
    ],
    parameters: Type.Object({
      type: Type.Optional(
        Type.String({
          description:
            "Volitelný filtr typu projektu (TypeScript, Node.js, Python, Rust, Go, C/C++, Java/Kotlin, .NET/C#, PHP, Ruby, Flutter/Dart, Swift, Git, General)",
        }),
      ),
      root: Type.Optional(
        Type.String({
          description:
            "Volitelný filtr podle kořenové složky (např. 'D:/01_programovani' nebo název kořene)",
        }),
      ),
      name: Type.Optional(
        Type.String({
          description: "Volitelný filtr podle názvu projektu (substring)",
        }),
      ),
      sortBy: Type.Optional(
        Type.String({
          description:
            "Volitelné řazení: 'name' (abecedně), 'root' (podle kořene), 'mtime' (podle data), 'type' (podle technologie), 'files' (podle počtu souborů), 'git' (podle stavu)",
        }),
      ),
      limit: Type.Optional(
        Type.Number({
          description: "Maximální počet vrácených projektů (výchozí: 100)",
        }),
      ),
    }),
    execute: async (_toolCallId, params) => {
      const filtered = filterProjects(currentIndex.projects, {
        type: params.type,
        root: params.root,
        name: params.name,
        sortBy: (params.sortBy as ProjectSortBy) || currentConfig.sortBy || "name",
      });

      const limit = params.limit ?? 100;
      const sliced = filtered.slice(0, limit);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                total: currentIndex.projects.length,
                matched: filtered.length,
                returned: sliced.length,
                projects: sliced.map((p) => ({
                  id: p.id,
                  name: p.name,
                  path: p.path,
                  rootPath: p.rootPath,
                  relativePath: p.relativePath,
                  type: p.type,
                  description: p.description,
                  fileCount: p.fileCount,
                  markers: p.markers,
                  git: p.git
                    ? {
                        branch: p.git.branch,
                        clean: p.git.clean,
                        summary: p.git.statusSummary,
                      }
                    : undefined,
                })),
              },
              null,
              2,
            ),
          },
        ],
        details: {
          total: currentIndex.projects.length,
          matched: filtered.length,
          returned: sliced.length,
        },
      };
    },
  });

  pi.registerTool({
    name: "search_projects",
    label: "Search Projects",
    description:
      "Inteligentně vyhledá projekty podle zadaného klíčového slova (název, cesta, kořen, technologie, značky, popis).",
    promptSnippet:
      "Použij search_projects pro vyhledání konkrétního projektu podle jména, cesty nebo technologie.",
    parameters: Type.Object({
      query: Type.String({
        description:
          "Hledaný výraz (např. 'mozek', 'adr', 'python scraper', 'rust')",
      }),
      root: Type.Optional(
        Type.String({
          description: "Volitelný filtr na kořenovou složku",
        }),
      ),
      type: Type.Optional(
        Type.String({
          description: "Volitelný filtr na technologii / typ projektu",
        }),
      ),
      limit: Type.Optional(
        Type.Number({
          description: "Maximální počet vrácených výsledků (výchozí: 50)",
        }),
      ),
    }),
    execute: async (_toolCallId, params) => {
      const ranked = searchAndRankProjects(currentIndex.projects, params.query, {
        root: params.root,
        type: params.type,
      });

      const limit = params.limit ?? 50;
      const sliced = ranked.slice(0, limit);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                query: params.query,
                matched: ranked.length,
                returned: sliced.length,
                results: sliced.map((r) => ({
                  score: r.score,
                  matchedFields: r.matchedFields,
                  project: {
                    id: r.project.id,
                    name: r.project.name,
                    path: r.project.path,
                    rootPath: r.project.rootPath,
                    relativePath: r.project.relativePath,
                    type: r.project.type,
                    description: r.project.description,
                    fileCount: r.project.fileCount,
                    git: r.project.git?.statusSummary,
                  },
                })),
              },
              null,
              2,
            ),
          },
        ],
        details: { matched: ranked.length, returned: sliced.length },
      };
    },
  });

  pi.registerTool({
    name: "add_project_root",
    label: "Add Project Root Folder",
    description:
      "Přidá novou kořenovou složku pro skenování projektů a spustí rescan.",
    parameters: Type.Object({
      path: Type.String({
        description: "Cesta ke složce (např. D:/01_programovani)",
      }),
    }),
    execute: async (
      _toolCallId,
      params,
    ): Promise<{
      content: Array<{ type: "text"; text: string }>;
      details: Record<string, unknown>;
    }> => {
      const norm = normalizePath(params.path);
      if (!currentConfig.roots.includes(norm)) {
        currentConfig.roots.push(norm);
        saveProjectsConfig(currentConfig);
        await refreshProjectsIndex();
        return {
          content: [
            {
              type: "text",
              text: `Kořenová složka "${norm}" byla úspěšně přidána. Celkem projektů: ${currentIndex.projects.length}`,
            },
          ],
          details: {
            added: true,
            root: norm,
            totalProjects: currentIndex.projects.length,
          },
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `Kořenová složka "${norm}" již v konfiguraci existuje.`,
          },
        ],
        details: { added: false, root: norm, exists: true },
      };
    },
  });

  pi.registerTool({
    name: "add_project_manually",
    label: "Add Project Manually",
    description: "Ručně zaregistruje konkrétní projekt podle cesty.",
    parameters: Type.Object({
      path: Type.String({ description: "Cesta k projektu" }),
      name: Type.Optional(
        Type.String({ description: "Volitelný vlastní název projektu" }),
      ),
    }),
    execute: async (
      _toolCallId,
      params,
    ): Promise<{
      content: Array<{ type: "text"; text: string }>;
      details: Record<string, unknown>;
    }> => {
      const norm = normalizePath(params.path);
      const item = createProjectItem(norm, undefined, "manual");
      if (!item) {
        return {
          content: [
            {
              type: "text",
              text: `Cesta "${norm}" neexistuje nebo z ní nelze načíst projekt.`,
            },
          ],
          details: { success: false, path: norm },
        };
      }

      if (params.name) {
        item.name = params.name;
      }

      const existingIdx = currentConfig.manualProjects.findIndex(
        (m) => normalizePath(m.path) === norm,
      );
      if (existingIdx >= 0) {
        currentConfig.manualProjects[existingIdx] = item;
      } else {
        currentConfig.manualProjects.push(item);
      }

      saveProjectsConfig(currentConfig);
      await refreshProjectsIndex();

      return {
        content: [
          {
            type: "text",
            text: `Projekt "${item.name}" (${item.type}) byl úspěšně přidán na cestě ${item.path}.`,
          },
        ],
        details: { success: true, path: norm, project: item },
      };
    },
  });

  // 3. Slash Command Handler & Lazy Autocompletion
  const handleProjectsCommand = async (
    args: string,
    ctx: ExtensionCommandContext,
  ) => {
    const trimmed = args.trim();
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    const sub = (tokens[0] ?? "").toLowerCase();
    const rest = tokens.slice(1);

    if (!sub || sub === "help" || sub === "-h" || sub === "--help") {
      ctx.ui.notify(renderHelpBanner(), "info");
      return;
    }

    switch (sub) {
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
              (currentConfig.roots.some((r) =>
                r.toLowerCase().includes(lower),
              ) ||
                currentIndex.projects.some(
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

        filterOptions.sortBy =
          customSort || currentConfig.sortBy || "name";

        const filtered = filterProjects(
          currentIndex.projects,
          filterOptions,
        );

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
        const proj = currentIndex.projects.find(
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
            sortLabels[currentConfig.sortBy || "name"] || "Abecedně (A-Z)";
          ctx.ui.notify(
            `Aktuální výchozí řazení: ${goldGlow(currentDesc)}.\nPro změnu zadejte: ${greenGlow("/projects sort [name | root | mtime | type | files | git]")}`,
            "info",
          );
          return;
        }

        const norm = normalizeSortBy(mode);
        currentConfig.sortBy = norm;
        saveProjectsConfig(currentConfig);
        currentIndex.projects = sortProjects(currentIndex.projects, norm);
        saveCachedProjects(currentIndex);

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

      case "pin": {
        const target = rest.join(" ").trim().toLowerCase();
        if (!target) {
          ctx.ui.notify(
            "Zadejte ID nebo název projektu: /projects pin <id|název>",
            "warning",
          );
          return;
        }
        const proj = currentIndex.projects.find(
          (p) =>
            p.id.toLowerCase() === target ||
            p.name.toLowerCase() === target ||
            p.path.toLowerCase().endsWith(target),
        );
        if (!proj) {
          ctx.ui.notify(`Projekt "${target}" nebyl nalezen.`, "warning");
          return;
        }
        const normP = normalizePath(proj.path);
        currentConfig.pinnedPaths = currentConfig.pinnedPaths ?? [];
        if (!currentConfig.pinnedPaths.includes(normP)) {
          currentConfig.pinnedPaths.push(normP);
          saveProjectsConfig(currentConfig);
          await refreshProjectsIndex();
        }
        ctx.ui.notify(
          `Projekt ${greenGlow(proj.name)} byl připnut na 1. místo! (📌)`,
          "info",
        );
        break;
      }

      case "unpin": {
        const target = rest.join(" ").trim().toLowerCase();
        if (!target) {
          ctx.ui.notify(
            "Zadejte ID nebo název projektu: /projects unpin <id|název>",
            "warning",
          );
          return;
        }
        const proj = currentIndex.projects.find(
          (p) =>
            p.id.toLowerCase() === target ||
            p.name.toLowerCase() === target ||
            p.path.toLowerCase().endsWith(target),
        );
        if (!proj) {
          ctx.ui.notify(`Projekt "${target}" nebyl nalezen.`, "warning");
          return;
        }
        const normP = normalizePath(proj.path);
        currentConfig.pinnedPaths = (currentConfig.pinnedPaths ?? []).filter(
          (p) => p !== normP,
        );
        saveProjectsConfig(currentConfig);
        await refreshProjectsIndex();
        ctx.ui.notify(`Projekt ${greenGlow(proj.name)} byl odepnut.`, "info");
        break;
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

        const existIdx = currentConfig.manualProjects.findIndex(
          (p) => normalizePath(p.path) === norm,
        );
        if (existIdx >= 0) {
          currentConfig.manualProjects[existIdx] = item;
        } else {
          currentConfig.manualProjects.push(item);
        }
        saveProjectsConfig(currentConfig);
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
        const beforeCount = currentIndex.projects.length;

        // Remove from manual projects if present
        currentConfig.manualProjects = currentConfig.manualProjects.filter(
          (p) =>
            p.id.toLowerCase() !== target &&
            p.name.toLowerCase() !== target &&
            normalizePath(p.path) !== normTarget,
        );

        // Add to excluded paths so auto scanner doesn't re-add it
        if (!currentConfig.excludedPaths.includes(normTarget)) {
          currentConfig.excludedPaths.push(normTarget);
        }

        saveProjectsConfig(currentConfig);
        await refreshProjectsIndex();
        const afterCount = currentIndex.projects.length;

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

      case "roots": {
        const action = rest[0]?.toLowerCase();
        const rootArg = rest.slice(1).join(" ").trim();

        if (!action || action === "list") {
          ctx.ui.notify(
            renderRootsTable(currentConfig.roots, currentIndex.projects),
            "info",
          );
          return;
        }

        if (action === "add") {
          if (!rootArg) {
            ctx.ui.notify(
              "Zadejte cestu ke kořenové složce: /projects roots add <cesta>",
              "warning",
            );
            return;
          }
          const norm = normalizePath(rootArg);
          if (currentConfig.roots.includes(norm)) {
            ctx.ui.notify(`Kořenová složka "${norm}" již existuje.`, "warning");
            return;
          }
          currentConfig.roots.push(norm);
          saveProjectsConfig(currentConfig);
          ctx.ui.notify(
            `Přidána kořenová složka: ${greenGlow(norm)}. Spouštím skenování...`,
            "info",
          );
          await refreshProjectsIndex(undefined, (msg) =>
            ctx.ui.notify(msg, "info"),
          );
          break;
        }

        if (action === "remove" || action === "rm") {
          if (!rootArg) {
            ctx.ui.notify(
              "Zadejte cestu ke kořenové složce: /projects roots remove <cesta>",
              "warning",
            );
            return;
          }
          const norm = normalizePath(rootArg);
          const initialLen = currentConfig.roots.length;
          currentConfig.roots = currentConfig.roots.filter(
            (r) => normalizePath(r) !== norm,
          );
          if (currentConfig.roots.length === initialLen) {
            ctx.ui.notify(
              `Kořenová složka "${norm}" nebyla v konfiguraci nalezena.`,
              "warning",
            );
            return;
          }
          saveProjectsConfig(currentConfig);
          ctx.ui.notify(
            `Odebrána kořenová složka: ${coralGlow(norm)}. Aktualizuji index...`,
            "info",
          );
          await refreshProjectsIndex(undefined, (msg) =>
            ctx.ui.notify(msg, "info"),
          );
          break;
        }

        ctx.ui.notify(
          "Použijte: /projects roots [list | add <cesta> | remove <cesta>]",
          "warning",
        );
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
          `Skenování dokončeno! Index obsahuje celkem ${greenGlow(String(currentIndex.projects.length))} projektů.`,
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
        const ranked = searchAndRankProjects(
          currentIndex.projects,
          query,
        );
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
        ctx.ui.notify(renderStatusSummary(currentConfig, currentIndex), "info");
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

  const getProjectsArgumentCompletions = async (
    prefix: string,
  ): Promise<AutocompleteItem[] | null> => {
    const tokens = prefix.split(/\s+/).filter(Boolean);
    const trailingSpace = /\s$/.test(prefix);
    const normalizedPrefix = tokens.join(" ").toLowerCase();

    // N-th Token Completion (2nd or 3rd level parameters)
    if (tokens.length > 1 || (trailingSpace && tokens.length === 1)) {
      const cmd = tokens[0]?.toLowerCase();

      // /projects show <id|name>
      if (cmd === "show") {
        const items = currentIndex.projects.map((p) => ({
          value: `show ${p.id}`,
          label: `${p.name}`,
          description: `[${p.type}] ${p.path}`,
        }));
        const filtered = items.filter(
          (i) =>
            i.value.toLowerCase().startsWith(normalizedPrefix) ||
            i.label.toLowerCase().includes(tokens[1]?.toLowerCase() ?? ""),
        );
        return filtered.length > 0 ? filtered : null;
      }

      // /projects remove <id|name>
      if (cmd === "remove" || cmd === "rm") {
        const items = currentIndex.projects.map((p) => ({
          value: `remove ${p.id}`,
          label: `${p.name}`,
          description: `[${p.type}] ${p.path}`,
        }));
        const filtered = items.filter(
          (i) =>
            i.value.toLowerCase().startsWith(normalizedPrefix) ||
            i.label.toLowerCase().includes(tokens[1]?.toLowerCase() ?? ""),
        );
        return filtered.length > 0 ? filtered : null;
      }

      // /projects pin <id|name>
      if (cmd === "pin") {
        const items = currentIndex.projects.map((p) => ({
          value: `pin ${p.id}`,
          label: `${p.name}`,
          description: `[${p.type}] ${p.path}`,
        }));
        const filtered = items.filter(
          (i) =>
            i.value.toLowerCase().startsWith(normalizedPrefix) ||
            i.label.toLowerCase().includes(tokens[1]?.toLowerCase() ?? ""),
        );
        return filtered.length > 0 ? filtered : null;
      }

      // /projects unpin <id|name>
      if (cmd === "unpin") {
        const items = currentIndex.projects.map((p) => ({
          value: `unpin ${p.id}`,
          label: `${p.name}`,
          description: `[${p.type}] ${p.path}`,
        }));
        const filtered = items.filter(
          (i) =>
            i.value.toLowerCase().startsWith(normalizedPrefix) ||
            i.label.toLowerCase().includes(tokens[1]?.toLowerCase() ?? ""),
        );
        return filtered.length > 0 ? filtered : null;
      }

      // /projects sort <name|root|mtime|type|files|git>
      if (cmd === "sort") {
        const sortOptions = [
          {
            value: "sort name",
            label: "sort name",
            description: "Řadit abecedně podle názvu (A-Z)",
          },
          {
            value: "sort root",
            label: "sort root",
            description: "Řadit podle kořenové složky",
          },
          {
            value: "sort mtime",
            label: "sort mtime",
            description: "Řadit podle data poslední změny (nejnovější)",
          },
          {
            value: "sort type",
            label: "sort type",
            description: "Řadit podle technologie / typu",
          },
          {
            value: "sort files",
            label: "sort files",
            description: "Řadit podle počtu souborů",
          },
          {
            value: "sort git",
            label: "sort git",
            description: "Řadit podle stavu Git repozitáře",
          },
        ];
        const filtered = sortOptions.filter((i) =>
          i.value.toLowerCase().startsWith(normalizedPrefix),
        );
        return filtered.length > 0 ? filtered : null;
      }

      // /projects search <query>
      if (cmd === "search" || cmd === "find") {
        const queryTerm = tokens.slice(1).join(" ").toLowerCase();
        const suggestions: AutocompleteItem[] = [];

        // Add matching project names
        for (const p of currentIndex.projects) {
          if (!queryTerm || p.name.toLowerCase().includes(queryTerm)) {
            suggestions.push({
              value: `${cmd} ${p.name}`,
              label: `${p.name}`,
              description: `[${p.type}] ${p.path}`,
            });
          }
          if (suggestions.length >= 10) break;
        }

        return suggestions.length > 0 ? suggestions : null;
      }

      // /projects roots <add|remove|list>
      if (cmd === "roots") {
        if (tokens.length === 2 && !trailingSpace) {
          const rootSub = [
            {
              value: "roots list",
              label: "roots list",
              description: "Zobrazit kořenové složky",
            },
            {
              value: "roots add",
              label: "roots add",
              description: "Přidat kořenovou složku",
            },
            {
              value: "roots remove",
              label: "roots remove",
              description: "Odebrat kořenovou složku",
            },
          ];
          const filtered = rootSub.filter((i) =>
            i.value.toLowerCase().startsWith(normalizedPrefix),
          );
          return filtered.length > 0 ? filtered : null;
        }

        if (
          tokens[1]?.toLowerCase() === "remove" ||
          tokens[1]?.toLowerCase() === "rm"
        ) {
          const items = currentConfig.roots.map((r) => ({
            value: `roots remove ${r}`,
            label: r,
            description: "Odebrat tuto kořenovou složku",
          }));
          const filtered = items.filter((i) =>
            i.value.toLowerCase().startsWith(normalizedPrefix),
          );
          return filtered.length > 0 ? filtered : null;
        }
      }

      // /projects list / filter
      if (cmd === "list" || cmd === "ls" || cmd === "filter") {
        const types = [
          "TypeScript",
          "Node.js",
          "Python",
          "Rust",
          "Go",
          "C/C++",
          "Java/Kotlin",
          ".NET/C#",
          "PHP",
          "Ruby",
          "Flutter/Dart",
          "Swift",
          "Git",
          "General",
        ];
        const typeItems = types.map((t) => ({
          value: `${cmd} ${t.toLowerCase()}`,
          label: `${cmd} ${t}`,
          description: `Filtrovat projekty typu ${t}`,
        }));

        const filterHelpers = [
          {
            value: `${cmd} root:`,
            label: `${cmd} root:<cesta>`,
            description: "Filtrovat podle kořenové složky",
          },
          {
            value: `${cmd} name:`,
            label: `${cmd} name:<text>`,
            description: "Filtrovat podle názvu projektu",
          },
          {
            value: `${cmd} type:`,
            label: `${cmd} type:<typ>`,
            description: "Filtrovat podle typu projektu",
          },
          {
            value: `${cmd} sort:`,
            label: `${cmd} sort:<name|root|mtime|type|files|git>`,
            description: "Řadit výpis podle kritéria",
          },
          {
            value: `${cmd} --dirty`,
            label: `${cmd} --dirty`,
            description: "Zobrazit pouze projekty se změnami v Git",
          },
          {
            value: `${cmd} --clean`,
            label: `${cmd} --clean`,
            description: "Zobrazit pouze čisté Git repozitáře",
          },
        ];

        const rootItems = currentConfig.roots.map((r) => ({
          value: `${cmd} root:${r}`,
          label: `${cmd} root:${r}`,
          description: `Filtrovat projekty z kořene ${r}`,
        }));

        const allItems = [...filterHelpers, ...rootItems, ...typeItems];
        const filtered = allItems.filter((i) =>
          i.value.toLowerCase().startsWith(normalizedPrefix),
        );
        return filtered.length > 0 ? filtered : null;
      }

      return null;
    }

    // 1st Token Completion (Subcommands from Dictionary)
    const typed = (tokens[0] ?? "").toLowerCase();
    const items = Object.entries(SUBCOMMANDS_DOCS)
      .filter(([key]) => key.toLowerCase().startsWith(typed))
      .map(([value, description]) => ({ value, label: value, description }));

    return items.length > 0 ? items : null;
  };

  pi.registerCommand("projects", {
    description: "Správa a index projektů, kořenových složek a @-našeptávání",
    getArgumentCompletions: getProjectsArgumentCompletions,
    handler: handleProjectsCommand,
  });

  pi.registerCommand("proj", {
    description: "Zkrácený alias pro /projects",
    getArgumentCompletions: getProjectsArgumentCompletions,
    handler: handleProjectsCommand,
  });
}
