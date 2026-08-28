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
  saveCachedProjects,
  saveProjectsConfig,
} from "./src/config.js";
import { createProjectItem } from "./src/detector.js";
import { scanAllRoots } from "./src/scanner.js";
import { createProjectsAutocompleteProvider } from "./src/autocomplete.js";
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
import type { ProjectsConfig, ProjectsIndex } from "./src/types.js";

const SUBCOMMANDS_DOCS: Record<string, string> = {
  list: "zobrazit přehlednou tabulku všech projektů",
  show: "zobrazit detail projektu podle ID či názvu",
  sort: "nastavit řazení projektů (name = abecedně | mtime = podle data)",
  pin: "připnout oblíbený projekt nahoru (<id|název>)",
  unpin: "odepnout projekt (<id|název>)",
  add: "ručně přidat projekt do indexu (<cesta> [název])",
  remove: "odebrat projekt z indexu (<id|cesta>)",
  roots: "správa kořenových složek pro skenování (list | add | remove)",
  scan: "spustit okamžité přegenerování indexu projektů",
  search: "vyhledávat v projektech podle dotazu",
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
      "Vrátí seznam všech detekovaných i ručně přidaných projektů z kořenových složek včetně typu, cest a statistik.",
    promptSnippet:
      "Použij list_projects pro získání přehledu všech dostupných projektů v systému.",
    promptGuidelines: [
      "Volej list_projects když uživatel hledá projekty nebo chce prozkoumat workspace.",
    ],
    parameters: Type.Object({
      type: Type.Optional(
        Type.String({
          description:
            "Volitelný filtr typu projektu (TypeScript, Python, Rust, Go, C/C++, Java/Kotlin, .NET/C#, PHP, Ruby, Flutter/Dart, Swift, Git, General)",
        }),
      ),
      limit: Type.Optional(
        Type.Number({
          description: "Maximální počet vrácených projektů (výchozí: 100)",
        }),
      ),
    }),
    execute: async (_toolCallId, params) => {
      let list = currentIndex.projects;
      if (params.type) {
        const t = params.type.toLowerCase();
        list = list.filter((p) => p.type.toLowerCase().includes(t));
      }
      const limit = params.limit ?? 100;
      const sliced = list.slice(0, limit);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                total: list.length,
                returned: sliced.length,
                projects: sliced.map((p) => ({
                  id: p.id,
                  name: p.name,
                  path: p.path,
                  type: p.type,
                  description: p.description,
                  fileCount: p.fileCount,
                  markers: p.markers,
                })),
              },
              null,
              2,
            ),
          },
        ],
        details: { total: list.length, returned: sliced.length },
      };
    },
  });

  pi.registerTool({
    name: "search_projects",
    label: "Search Projects",
    description:
      "Vyhledá projekty podle zadaného klíčového slova (název, cesta, technologie, značky).",
    promptSnippet:
      "Použij search_projects pro vyhledání konkrétního projektu podle jména nebo technologie.",
    parameters: Type.Object({
      query: Type.String({
        description: "Hledaný výraz (např. 'mozek', 'adr', 'python', 'spai')",
      }),
    }),
    execute: async (_toolCallId, params) => {
      const q = params.query.toLowerCase().trim();
      const matched = currentIndex.projects.filter((p) => {
        return (
          p.name.toLowerCase().includes(q) ||
          p.path.toLowerCase().includes(q) ||
          p.type.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q)) ||
          p.markers.some((m) => m.toLowerCase().includes(q))
        );
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                query: params.query,
                count: matched.length,
                results: matched,
              },
              null,
              2,
            ),
          },
        ],
        details: { count: matched.length },
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
      case "list":
      case "ls": {
        const filterType = rest[0]?.toLowerCase();
        let list = currentIndex.projects;
        if (filterType) {
          list = list.filter((p) => p.type.toLowerCase().includes(filterType));
        }
        ctx.ui.notify(renderProjectTable(list), "info");
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
          const currentDesc =
            currentConfig.sortBy === "mtime"
              ? "podle data změny (nejnovější)"
              : "abecedně (A-Z)";
          ctx.ui.notify(
            `Aktuální řazení: ${goldGlow(currentDesc)}. Pro změnu použijte: /projects sort [name|mtime]`,
            "info",
          );
          return;
        }

        if (
          mode === "name" ||
          mode === "alphabet" ||
          mode === "alpha" ||
          mode === "abc"
        ) {
          currentConfig.sortBy = "name";
          saveProjectsConfig(currentConfig);
          await refreshProjectsIndex();
          ctx.ui.notify(
            `Řazení projektů nastaveno na: ${greenGlow("Abecedně (A-Z)")}`,
            "info",
          );
          break;
        }

        if (
          mode === "mtime" ||
          mode === "date" ||
          mode === "time" ||
          mode === "cas"
        ) {
          currentConfig.sortBy = "mtime";
          saveProjectsConfig(currentConfig);
          await refreshProjectsIndex();
          ctx.ui.notify(
            `Řazení projektů nastaveno na: ${greenGlow("Podle data změny (nejnovější)")}`,
            "info",
          );
          break;
        }

        ctx.ui.notify("Použijte: /projects sort [name | mtime]", "warning");
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

      case "search": {
        const query = rest.join(" ").trim().toLowerCase();
        if (!query) {
          ctx.ui.notify(
            "Zadejte hledaný dotaz: /projects search <dotaz>",
            "warning",
          );
          return;
        }
        const results = currentIndex.projects.filter(
          (p) =>
            p.name.toLowerCase().includes(query) ||
            p.path.toLowerCase().includes(query) ||
            p.type.toLowerCase().includes(query) ||
            (p.description && p.description.toLowerCase().includes(query)),
        );
        if (results.length === 0) {
          ctx.ui.notify(
            `Pro dotaz "${query}" nebyly nalezeny žádné projekty.`,
            "warning",
          );
          return;
        }
        ctx.ui.notify(renderProjectTable(results), "info");
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

      // /projects sort <name|mtime>
      if (cmd === "sort") {
        const sortOptions = [
          {
            value: "sort name",
            label: "sort name",
            description: "Řadit abecedně (A-Z)",
          },
          {
            value: "sort mtime",
            label: "sort mtime",
            description: "Řadit podle data poslední změny (nejnovější)",
          },
        ];
        const filtered = sortOptions.filter((i) =>
          i.value.toLowerCase().startsWith(normalizedPrefix),
        );
        return filtered.length > 0 ? filtered : null;
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

      // /projects list <type>
      if (cmd === "list" || cmd === "ls") {
        const types = [
          "TypeScript",
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
        const items = types.map((t) => ({
          value: `list ${t.toLowerCase()}`,
          label: `list ${t}`,
          description: `Filtrovat projekty typu ${t}`,
        }));
        const filtered = items.filter((i) =>
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
