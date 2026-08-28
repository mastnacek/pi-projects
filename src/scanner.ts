import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectItem, ProjectsConfig, ProjectsIndex } from "./types.js";
import {
  createProjectItem,
  detectProjectInDir,
  IGNORED_SCAN_DIRS,
} from "./detector.js";
import { normalizePath } from "./config.js";
import { readGitInfo } from "./git.js";

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

  const sortBy =
    config.sortBy === "mtime" || config.sortBy === "date" ? "mtime" : "name";

  // Sort projects: pinned first, then by configured sortBy
  const sorted = projectList.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    if (sortBy === "mtime") {
      if (b.lastModified !== a.lastModified) {
        return b.lastModified - a.lastModified;
      }
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  return {
    projects: sorted,
    lastUpdated: Date.now(),
    rootsScanned,
  };
}
