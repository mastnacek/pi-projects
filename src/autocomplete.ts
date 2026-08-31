import type {
  AutocompleteItem,
  AutocompleteProvider,
  AutocompleteSuggestions,
} from "@earendil-works/pi-tui";
import type { ProjectItem, ProjectSortBy } from "./types.js";
import { normalizeSortBy } from "./config.js";

export function abbreviateRootOrigin(
  rootPath?: string,
  source?: string,
): string {
  if (!rootPath) {
    return source === "manual" ? "manual" : "root";
  }

  const norm = rootPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const driveMatch = norm.match(/^([A-Za-z]:)/);
  const drive = driveMatch ? driveMatch[1] : "";
  const parts = norm.split("/").filter(Boolean);
  const lastFolder = parts[parts.length - 1] || "";

  let shortFolder = lastFolder;
  if (shortFolder.length > 9) {
    if (shortFolder.includes("_")) {
      const segs = shortFolder.split("_");
      shortFolder = segs.map((s) => s.slice(0, 4)).join("_");
    } else if (shortFolder.includes("-")) {
      const segs = shortFolder.split("-");
      shortFolder = segs.map((s) => s.slice(0, 4)).join("-");
    } else {
      shortFolder = `${shortFolder.slice(0, 7)}..`;
    }
  }

  if (drive) {
    return `${drive}${shortFolder}`;
  }
  return shortFolder || "root";
}

function extractAtToken(
  textBeforeCursor: string,
): { rawPrefix: string; query: string; isQuoted: boolean } | null {
  // Check unclosed quoted @"...
  const quoteMatch = textBeforeCursor.match(/(?:^|[ \t([{])(@"[^"\n]*)$/);
  if (quoteMatch) {
    const rawPrefix = quoteMatch[1] ?? "";
    const query = rawPrefix.slice(2);
    return { rawPrefix, query, isQuoted: true };
  }

  // Check bare @...
  const match = textBeforeCursor.match(/(?:^|[ \t([{])(@[^\s"(){}[\],;:!?]*)$/);
  if (match) {
    const rawPrefix = match[1] ?? "";
    const query = rawPrefix.slice(1);
    return { rawPrefix, query, isQuoted: false };
  }

  return null;
}

function scoreProject(proj: ProjectItem, query: string): number {
  if (!query) return 1;

  const lowerQ = query.toLowerCase().replace(/\\/g, "/");
  const lowerName = proj.name.toLowerCase();
  const lowerPath = proj.path.toLowerCase().replace(/\\/g, "/");
  const lowerRel = proj.relativePath
    ? proj.relativePath.toLowerCase().replace(/\\/g, "/")
    : "";
  const lowerType = proj.type.toLowerCase();
  const lowerBranch = proj.git?.branch ? proj.git.branch.toLowerCase() : "";

  // Exact path or name match
  if (
    lowerPath === lowerQ ||
    lowerPath + "/" === lowerQ ||
    lowerName === lowerQ
  )
    return 100;
  if (lowerName.startsWith(lowerQ)) return 85;
  if (lowerPath.startsWith(lowerQ) || lowerQ.startsWith(lowerPath)) return 80;
  if (lowerRel && lowerRel.startsWith(lowerQ)) return 75;
  if (lowerBranch === lowerQ) return 70;
  if (lowerName.includes(lowerQ)) return 60;
  if (lowerRel && lowerRel.includes(lowerQ)) return 50;
  if (lowerPath.includes(lowerQ)) return 40;
  if (lowerType.startsWith(lowerQ)) return 30;

  return 0;
}

export function filterProjectsForAutocomplete(
  projects: ProjectItem[],
  query: string,
  maxResults?: number,
  sortBy: ProjectSortBy = "name",
): ProjectItem[] {
  const normSort = normalizeSortBy(sortBy);

  if (!query) {
    const sorted = [...projects].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      if (normSort === "mtime") {
        if (b.lastModified !== a.lastModified) {
          return b.lastModified - a.lastModified;
        }
      } else if (normSort === "root") {
        const rootA = (a.rootPath || a.source || "").toLowerCase();
        const rootB = (b.rootPath || b.source || "").toLowerCase();
        const cmp = rootA.localeCompare(rootB, undefined, {
          sensitivity: "base",
        });
        if (cmp !== 0) return cmp;
      } else if (normSort === "type") {
        const cmp = a.type.localeCompare(b.type, undefined, {
          sensitivity: "base",
        });
        if (cmp !== 0) return cmp;
      } else if (normSort === "files") {
        if (b.fileCount !== a.fileCount) return b.fileCount - a.fileCount;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
    return maxResults ? sorted.slice(0, maxResults) : sorted;
  }

  const scored = projects
    .map((p) => ({ project: p, score: scoreProject(p, query) }))
    .filter((entry) => entry.score > 0);

  scored.sort((a, b) => {
    if (a.project.pinned && !b.project.pinned) return -1;
    if (!a.project.pinned && b.project.pinned) return 1;
    if (b.score !== a.score) return b.score - a.score;
    if (normSort === "mtime") {
      if (b.project.lastModified !== a.project.lastModified) {
        return b.project.lastModified - a.project.lastModified;
      }
    } else if (normSort === "root") {
      const rootA = (
        a.project.rootPath ||
        a.project.source ||
        ""
      ).toLowerCase();
      const rootB = (
        b.project.rootPath ||
        b.project.source ||
        ""
      ).toLowerCase();
      const cmp = rootA.localeCompare(rootB, undefined, {
        sensitivity: "base",
      });
      if (cmp !== 0) return cmp;
    }
    return a.project.name.localeCompare(b.project.name, undefined, {
      sensitivity: "base",
    });
  });

  return maxResults
    ? scored.slice(0, maxResults).map((e) => e.project)
    : scored.map((e) => e.project);
}

export function formatProjectAutocompleteItem(
  proj: ProjectItem,
  isQuotedPrefix: boolean,
): AutocompleteItem {
  const normPath = proj.path.replace(/\\/g, "/");
  const pathValue = normPath.endsWith("/") ? normPath : `${normPath}/`;
  const needsQuotes = isQuotedPrefix || pathValue.includes(" ");

  const value = needsQuotes ? `@"${pathValue}"` : `@${pathValue}`;
  const displayLocation = proj.relativePath || proj.path;

  const pinIcon = proj.pinned ? "📌 " : "";
  let gitTag = "";
  if (proj.git?.branch) {
    gitTag = ` (${proj.git.branch} ${proj.git.statusEmoji})`;
  } else if (proj.git?.statusEmoji) {
    gitTag = ` (${proj.git.statusEmoji})`;
  }

  const rootAbbrev = abbreviateRootOrigin(proj.rootPath, proj.source);

  // Check if project is nested within a subfolder
  let parentFolder = "";
  const rel = (proj.relativePath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
  if (rel) {
    const segs = rel.split("/").filter(Boolean);
    if (segs.length > 1) {
      parentFolder = segs.slice(0, -1).join("/");
    }
  } else if (proj.rootPath) {
    const normRoot = proj.rootPath.replace(/\\/g, "/").replace(/\/+$/, "");
    if (normPath.startsWith(normRoot)) {
      const subRel = normPath.slice(normRoot.length).replace(/^\/+|\/+$/g, "");
      const segs = subRel.split("/").filter(Boolean);
      if (segs.length > 1) {
        parentFolder = segs.slice(0, -1).join("/");
      }
    }
  }

  const label = parentFolder
    ? `📁 ${parentFolder}/ └─ ${pinIcon}${proj.name}/${gitTag} [${rootAbbrev}]`
    : `📁 ${pinIcon}${proj.name}/${gitTag} [${rootAbbrev}]`;

  const gitSummaryTag = proj.git?.statusSummary
    ? `[${proj.git.statusSummary}] `
    : "";
  const locationTag = parentFolder
    ? `↳ ${parentFolder}/${proj.name}`
    : displayLocation;

  return {
    value,
    label,
    description: `[${rootAbbrev}] [${proj.type}] ${gitSummaryTag}${locationTag} (${proj.fileCount} souborů)`,
  };
}

export function createProjectsAutocompleteProvider(
  current: AutocompleteProvider,
  getProjects: () => ProjectItem[],
  isEnabled: () => boolean,
  getSortBy: () => ProjectSortBy = () => "name",
): AutocompleteProvider {
  return {
    async getSuggestions(
      lines: string[],
      cursorLine: number,
      cursorCol: number,
      options: { signal: AbortSignal; force?: boolean },
    ): Promise<AutocompleteSuggestions | null> {
      const line = lines[cursorLine] ?? "";
      const beforeCursor = line.slice(0, cursorCol);
      const atToken = extractAtToken(beforeCursor);

      if (!atToken || !isEnabled()) {
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }

      const allProjects = getProjects();
      const matchedProjects = filterProjectsForAutocomplete(
        allProjects,
        atToken.query,
        undefined,
        getSortBy(),
      );
      const projectItems = matchedProjects.map((p) =>
        formatProjectAutocompleteItem(p, atToken.isQuoted),
      );

      // Call base provider to get existing file/folder completions
      let baseSuggestions: AutocompleteSuggestions | null = null;
      try {
        baseSuggestions = await current.getSuggestions(
          lines,
          cursorLine,
          cursorCol,
          options,
        );
      } catch {
        // Ignore base failure
      }

      if (options.signal.aborted) {
        return null;
      }

      if (
        !baseSuggestions ||
        !baseSuggestions.items ||
        baseSuggestions.items.length === 0
      ) {
        if (projectItems.length > 0) {
          return {
            items: projectItems,
            prefix: atToken.rawPrefix,
          };
        }
        return null;
      }

      // Prepend project items, filtering out duplicates
      const seenValues = new Set(projectItems.map((i) => i.value));

      // Decorate base suggestion items if they match known subprojects
      const projectMap = new Map(
        allProjects.map((p) => [p.path.replace(/\\/g, "/"), p]),
      );
      const decoratedBaseItems = baseSuggestions.items
        .filter((i) => !seenValues.has(i.value))
        .map((item) => {
          const itemVal = item.value
            .replace(/^@"?|"$/g, "")
            .replace(/\\/g, "/");
          const normVal = itemVal.endsWith("/")
            ? itemVal.slice(0, -1)
            : itemVal;
          const matchSub = projectMap.get(normVal);
          if (matchSub) {
            const gitBadge = matchSub.git
              ? ` (${matchSub.git.branch} ${matchSub.git.statusEmoji})`
              : "";
            const rootAbbrev = abbreviateRootOrigin(
              matchSub.rootPath,
              matchSub.source,
            );
            const pinIcon = matchSub.pinned ? "📌 " : "";
            let parentFolder = "";
            const rel = (matchSub.relativePath || "")
              .replace(/\\/g, "/")
              .replace(/^\/+|\/+$/g, "");
            if (rel) {
              const segs = rel.split("/").filter(Boolean);
              if (segs.length > 1) {
                parentFolder = segs.slice(0, -1).join("/");
              }
            }
            const label = parentFolder
              ? `📁 ${parentFolder}/ └─ ${pinIcon}${matchSub.name}/${gitBadge} [${rootAbbrev}]`
              : `📁 ${pinIcon}${matchSub.name}/${gitBadge} [${rootAbbrev}]`;

            return {
              ...item,
              label,
              description: `[${rootAbbrev}] [${matchSub.type}] ${matchSub.git?.statusSummary ? `[${matchSub.git.statusSummary}] ` : ""}${matchSub.path}`,
            };
          }
          return item;
        });

      return {
        items: [...projectItems, ...decoratedBaseItems],
        prefix: baseSuggestions.prefix || atToken.rawPrefix,
      };
    },

    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      return current.applyCompletion(
        lines,
        cursorLine,
        cursorCol,
        item,
        prefix,
      );
    },

    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      return (
        current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ??
        true
      );
    },
  };
}
