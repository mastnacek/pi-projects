import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type {
  ProjectFilterOptions,
  ProjectItem,
  ProjectsConfig,
  ProjectsIndex,
  ProjectSortBy,
} from "./types.js";
import {
  createProjectItem,
  detectProjectInDir,
  IGNORED_SCAN_DIRS,
} from "./detector.js";
import { normalizePath, normalizeSortBy } from "./config.js";
import { readGitInfo } from "./git.js";
import { abbreviateRootOrigin } from "./autocomplete.js";

function getRootSortKey(p: ProjectItem): string {
  if (p.rootPath) return p.rootPath.toLowerCase();
  return p.source === "manual" ? "manual" : "root";
}

export function sortProjects(
  projects: ProjectItem[],
  sortBy: ProjectSortBy | string = "name",
): ProjectItem[] {
  const normSort = normalizeSortBy(sortBy);

  return [...projects].sort((a, b) => {
    // Pinned projects always come first
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;

    if (normSort === "mtime") {
      if (b.lastModified !== a.lastModified) {
        return b.lastModified - a.lastModified;
      }
    } else if (normSort === "root") {
      const rootA = getRootSortKey(a);
      const rootB = getRootSortKey(b);
      const rootCmp = rootA.localeCompare(rootB, undefined, {
        sensitivity: "base",
      });
      if (rootCmp !== 0) return rootCmp;
    } else if (normSort === "type") {
      const typeCmp = a.type.localeCompare(b.type, undefined, {
        sensitivity: "base",
      });
      if (typeCmp !== 0) return typeCmp;
    } else if (normSort === "files") {
      if (b.fileCount !== a.fileCount) {
        return b.fileCount - a.fileCount;
      }
    } else if (normSort === "git") {
      const scoreA = a.git ? (a.git.clean ? 1 : 2) : 0;
      const scoreB = b.git ? (b.git.clean ? 1 : 2) : 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
    }

    // Default secondary sort: project name A-Z
    return a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
      numeric: true,
    });
  });
}

export function filterProjects(
  projects: ProjectItem[],
  options: ProjectFilterOptions,
): ProjectItem[] {
  let list = projects;

  if (options.name) {
    const q = options.name.toLowerCase().trim();
    list = list.filter((p) => p.name.toLowerCase().includes(q));
  }

  if (options.root) {
    const r = options.root.toLowerCase().trim();
    list = list.filter((p) => {
      const rootP = (p.rootPath || "").toLowerCase();
      const abbrev = abbreviateRootOrigin(p.rootPath, p.source).toLowerCase();
      const pathP = p.path.toLowerCase();
      return rootP.includes(r) || abbrev.includes(r) || pathP.includes(r);
    });
  }

  if (options.type) {
    const t = options.type.toLowerCase().trim();
    list = list.filter((p) => p.type.toLowerCase().includes(t));
  }

  if (options.gitOnly) {
    list = list.filter((p) => Boolean(p.git));
  }

  if (options.dirtyOnly) {
    list = list.filter((p) => Boolean(p.git && !p.git.clean));
  }

  if (options.cleanOnly) {
    list = list.filter((p) => Boolean(p.git && p.git.clean));
  }

  if (options.query) {
    const q = options.query.toLowerCase().trim();
    const terms = q.split(/\s+/).filter(Boolean);
    list = list.filter((p) => {
      const nameL = p.name.toLowerCase();
      const pathL = p.path.toLowerCase();
      const typeL = p.type.toLowerCase();
      const descL = (p.description || "").toLowerCase();
      const rootL = (p.rootPath || "").toLowerCase();
      const rootAbbrev = abbreviateRootOrigin(
        p.rootPath,
        p.source,
      ).toLowerCase();
      const markersL = p.markers.map((m) => m.toLowerCase());
      const branchL = (p.git?.branch || "").toLowerCase();

      return terms.every((term) => {
        return (
          nameL.includes(term) ||
          pathL.includes(term) ||
          typeL.includes(term) ||
          descL.includes(term) ||
          rootL.includes(term) ||
          rootAbbrev.includes(term) ||
          branchL.includes(term) ||
          markersL.some((m) => m.includes(term))
        );
      });
    });
  }

  if (options.sortBy) {
    list = sortProjects(list, options.sortBy);
  }

  return list;
}

export interface SearchResultItem {
  project: ProjectItem;
  score: number;
  matchedFields: string[];
}

export function searchAndRankProjects(
  projects: ProjectItem[],
  query: string,
  options?: { root?: string; type?: string; sortBy?: ProjectSortBy },
): SearchResultItem[] {
  let list = projects;
  if (options?.root) {
    const r = options.root.toLowerCase().trim();
    list = list.filter(
      (p) =>
        (p.rootPath || "").toLowerCase().includes(r) ||
        abbreviateRootOrigin(p.rootPath, p.source).toLowerCase().includes(r) ||
        p.path.toLowerCase().includes(r),
    );
  }
  if (options?.type) {
    const t = options.type.toLowerCase().trim();
    list = list.filter((p) => p.type.toLowerCase().includes(t));
  }

  const q = query.toLowerCase().trim();
  if (!q) {
    const sorted = options?.sortBy ? sortProjects(list, options.sortBy) : list;
    return sorted.map((p) => ({ project: p, score: 1, matchedFields: [] }));
  }

  const terms = q.split(/\s+/).filter(Boolean);
  const results: SearchResultItem[] = [];

  for (const p of list) {
    let totalScore = 0;
    const matchedFields: string[] = [];
    const nameL = p.name.toLowerCase();
    const pathL = p.path.toLowerCase();
    const relL = (p.relativePath || "").toLowerCase();
    const typeL = p.type.toLowerCase();
    const descL = (p.description || "").toLowerCase();
    const rootL = (p.rootPath || "").toLowerCase();
    const rootAbbrev = abbreviateRootOrigin(p.rootPath, p.source).toLowerCase();
    const branchL = (p.git?.branch || "").toLowerCase();

    let allMatched = true;
    for (const term of terms) {
      let termScore = 0;

      if (nameL === term) {
        termScore += 100;
        matchedFields.push("name(exact)");
      } else if (nameL.startsWith(term)) {
        termScore += 70;
        matchedFields.push("name(prefix)");
      } else if (nameL.includes(term)) {
        termScore += 45;
        matchedFields.push("name");
      }

      if (relL.includes(term)) {
        termScore += 30;
        matchedFields.push("relPath");
      } else if (pathL.includes(term)) {
        termScore += 20;
        matchedFields.push("path");
      }

      if (typeL.includes(term)) {
        termScore += 35;
        matchedFields.push("type");
      }

      if (rootL.includes(term) || rootAbbrev.includes(term)) {
        termScore += 25;
        matchedFields.push("root");
      }

      if (branchL.includes(term)) {
        termScore += 25;
        matchedFields.push("branch");
      }

      if (descL.includes(term)) {
        termScore += 15;
        matchedFields.push("description");
      }

      if (p.markers.some((m) => m.toLowerCase().includes(term))) {
        termScore += 15;
        matchedFields.push("marker");
      }

      if (termScore === 0) {
        allMatched = false;
        break;
      }
      totalScore += termScore;
    }

    if (allMatched && totalScore > 0) {
      results.push({
        project: p,
        score: totalScore,
        matchedFields: Array.from(new Set(matchedFields)),
      });
    }
  }

  results.sort((a, b) => {
    if (a.project.pinned && !b.project.pinned) return -1;
    if (!a.project.pinned && b.project.pinned) return 1;
    if (b.score !== a.score) return b.score - a.score;
    return a.project.name.localeCompare(b.project.name, undefined, {
      sensitivity: "base",
    });
  });

  return results;
}

interface ScanContext {
  signal?: AbortSignal;
  maxDepth: number;
  excluded: Set<string>;
  foundProjects: Map<string, ProjectItem>;
}

async function walkDirectory(
  currentDir: string,
  rootPath: string,
  depth: number,
  ctx: ScanContext,
): Promise<void> {
  if (ctx.signal?.aborted) return;
  if (depth > ctx.maxDepth) return;

  const normalized = normalizePath(currentDir);
  if (ctx.excluded.has(normalized)) return;

  // Check if currentDir is a project (don't detect root itself if depth === 0 and user wants subprojects, unless root is a project)
  if (depth > 0) {
    try {
      const item = createProjectItem(normalized, rootPath, "auto");
      if (item) {
        ctx.foundProjects.set(normalized, item);
      }
    } catch {
      // Non-fatal
    }
  }

  // Scan subdirectories
  let entries;
  try {
    entries = await readdir(normalized, { withFileTypes: true });
  } catch {
    return; // Folder unreadable / no permission
  }

  for (const entry of entries) {
    if (ctx.signal?.aborted) return;
    if (!entry.isDirectory()) continue;
    if (IGNORED_SCAN_DIRS.has(entry.name)) continue;

    const subDir = join(normalized, entry.name);
    await walkDirectory(subDir, rootPath, depth + 1, ctx);
  }
}

export async function scanRootFolder(
  rootPath: string,
  config: ProjectsConfig,
  signal?: AbortSignal,
): Promise<ProjectItem[]> {
  const normRoot = normalizePath(rootPath);
  try {
    const st = await stat(normRoot);
    if (!st.isDirectory()) return [];
  } catch {
    return [];
  }

  const ctx: ScanContext = {
    signal,
    maxDepth: config.maxDepth ?? 5,
    excluded: new Set(config.excludedPaths.map((p) => normalizePath(p))),
    foundProjects: new Map<string, ProjectItem>(),
  };

  // Check if the root folder itself is a project
  try {
    const rootItem = createProjectItem(normRoot, normRoot, "auto");
    if (rootItem) {
      ctx.foundProjects.set(normRoot, rootItem);
    }
  } catch {
    // Non-fatal
  }

  await walkDirectory(normRoot, normRoot, 0, ctx);
  return Array.from(ctx.foundProjects.values());
}

export async function scanAllRoots(
  config: ProjectsConfig,
  signal?: AbortSignal,
): Promise<ProjectsIndex> {
  const allProjects = new Map<string, ProjectItem>();
  const rootsScanned: string[] = [];

  for (const root of config.roots) {
    if (signal?.aborted) break;
    const normRoot = normalizePath(root);
    rootsScanned.push(normRoot);

    const items = await scanRootFolder(normRoot, config, signal);
    for (const item of items) {
      allProjects.set(item.path, item);
    }
  }

  // Merge manual projects
  for (const manual of config.manualProjects) {
    const normPath = normalizePath(manual.path);
    if (!config.excludedPaths.includes(normPath)) {
      // Re-detect or keep metadata
      try {
        const detected = detectProjectInDir(normPath);
        if (detected) {
          allProjects.set(normPath, {
            ...manual,
            name: manual.name || detected.name,
            path: normPath,
            type: detected.type,
            markers: detected.markers,
            description: manual.description || detected.description,
            fileCount: detected.fileCount,
            lastModified: detected.lastModified,
            source: "manual",
          });
        } else {
          allProjects.set(normPath, {
            ...manual,
            path: normPath,
            source: "manual",
          });
        }
      } catch {
        allProjects.set(normPath, {
          ...manual,
          path: normPath,
          source: "manual",
        });
      }
    }
  }

  // Remove any excluded paths
  for (const excluded of config.excludedPaths) {
    allProjects.delete(normalizePath(excluded));
  }

  const projectList = Array.from(allProjects.values());

  const pinnedSet = new Set(
    (config.pinnedPaths ?? []).map((p) => normalizePath(p)),
  );

  // Enrich with Git repository status in parallel and apply pinned flags
  const gitTasks: Promise<void>[] = [];
  for (const project of projectList) {
    if (pinnedSet.has(normalizePath(project.path))) {
      project.pinned = true;
    }
    gitTasks.push(
      (async () => {
        if (signal?.aborted) return;
        try {
          const git = await readGitInfo(project.path);
          if (git) {
            project.git = git;
          }
        } catch {
          // Non-fatal
        }
      })(),
    );
  }
  await Promise.all(gitTasks);

  const sorted = sortProjects(projectList, config.sortBy || "name");

  return {
    projects: sorted,
    lastUpdated: Date.now(),
    rootsScanned,
  };
}
