// LLM tools registered by the projects extension.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { normalizePath, saveProjectsConfig } from "./config.js";
import { createProjectItem } from "./detector.js";
import { refreshProjectsIndex } from "./refresh.js";
import { filterProjects, searchAndRankProjects } from "./scanner.js";
import { projects } from "./state.js";
import type { ProjectSortBy } from "./types.js";

export function registerProjectsTools(pi: ExtensionAPI): void {
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
      const filtered = filterProjects(projects.index.projects, {
        type: params.type,
        root: params.root,
        name: params.name,
        sortBy:
          (params.sortBy as ProjectSortBy) || projects.config.sortBy || "name",
      });

      const limit = params.limit ?? 100;
      const sliced = filtered.slice(0, limit);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                total: projects.index.projects.length,
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
          total: projects.index.projects.length,
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
      const ranked = searchAndRankProjects(
        projects.index.projects,
        params.query,
        {
          root: params.root,
          type: params.type,
        },
      );

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
      if (!projects.config.roots.includes(norm)) {
        projects.config.roots.push(norm);
        // Tool-side write: the session cwd decides the project layer.
        saveProjectsConfig(projects.config, false);
        await refreshProjectsIndex();
        return {
          content: [
            {
              type: "text",
              text: `Kořenová složka "${norm}" byla úspěšně přidána. Celkem projektů: ${projects.index.projects.length}`,
            },
          ],
          details: {
            added: true,
            root: norm,
            totalProjects: projects.index.projects.length,
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
        throw new Error(
          `Cesta "${norm}" neexistuje nebo z ní nelze načíst projekt.`,
        );
      }

      if (params.name) {
        item.name = params.name;
      }

      const existingIdx = projects.config.manualProjects.findIndex(
        (m) => normalizePath(m.path) === norm,
      );
      if (existingIdx >= 0) {
        projects.config.manualProjects[existingIdx] = item;
      } else {
        projects.config.manualProjects.push(item);
      }

      // Tool-side write: the session cwd decides the project layer.
      saveProjectsConfig(projects.config, false);
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
}
