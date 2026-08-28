import type {
  AutocompleteItem,
  AutocompleteProvider,
  AutocompleteSuggestions,
} from "@earendil-works/pi-tui";
import type { ProjectItem, ProjectSortBy } from "./types.js";

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
  const isMtime = sortBy === "mtime" || sortBy === "date";

  if (!query) {
    const sorted = [...projects].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      if (isMtime) {
        if (b.lastModified !== a.lastModified) {
          return b.lastModified - a.lastModified;
        }
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
    if (isMtime) {
      if (b.project.lastModified !== a.project.lastModified) {
        return b.project.lastModified - a.project.lastModified;
      }
    }
    return a.project.name.localeCompare(b.project.name, undefined, {
      sensitivity: "base",
    });
  });

  return maxResults ? scored.slice(0, maxResults).map((e) => e.project) : scored.map((e) => e.project);
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
  const gitTag = proj.git?.branch
    ? ` (${proj.git.branch} ${proj.git.statusEmoji})`
    : proj.git?.statusEmoji
      ? ` (${proj.git.statusEmoji})`
      : "";

  return {
    value,
    label: `📁 ${pinIcon}${proj.name}/${gitTag}`,
    description: `[${proj.type}] ${proj.git?.statusSummary ? `[${proj.git.statusSummary}] ` : ""}${displayLocation} (${proj.fileCount} souborů)`,
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
            return {
              ...item,
              label: `📁 ${matchSub.name}/${gitBadge}`,
              description: `[${matchSub.type}] ${matchSub.path}`,
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
