import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { homedir } from "node:os";
import type { ProjectsConfig, ProjectsIndex } from "./types.js";

/**
 * Config cascade (lowest priority first):
 *   defaults <- ~/.pi/agent/pi-projects.json <- <cwd>/.pi/pi-projects.json
 * `--global` writes the global layer; without it the project layer is written.
 *
 * NOTE: `~/.pi/agent/pi-projects.json` is a shared registry — pi-spai reads the
 * same file (src/projects-scanner.ts) and applies the same cascade.
 */
function agentDir(): string {
  const override = process.env.PI_CODING_AGENT_DIR?.trim();
  return override && override.length > 0 ? override : join(homedir(), ".pi", "agent");
}

/** Global layer: `--global` writes here. */
export function globalConfigPath(): string {
  return join(agentDir(), "pi-projects.json");
}

/** Derived cache; deliberately not cascaded (one cache per machine). */
export function cachePath(): string {
  return join(agentDir(), "pi-projects-cache.json");
}

/** Project layer: wins over the global layer. */
export function projectConfigPath(cwd: string): string {
  return join(cwd, ".pi", "pi-projects.json");
}

/** Layer a write lands in: global for `--global` or when no cwd is known. */
export function targetConfigPath(cwd: string | undefined, isGlobal: boolean): string {
  if (isGlobal || !cwd) return globalConfigPath();
  return projectConfigPath(cwd);
}

/** Session cwd the project layer hangs off; unset = global layer only. */
let configCwd: string | undefined;

/** Rebind the cascade to a session's project layer. */
export function setConfigCwd(cwd?: string): void {
  configCwd = cwd;
}

export function getConfigCwd(): string | undefined {
  return configCwd;
}

export function normalizeSortBy(
  s?: string,
): "name" | "root" | "mtime" | "type" | "files" | "git" {
  if (!s) return "name";
  const lower = s.toLowerCase().trim();
  if (lower === "root" || lower === "origin" || lower === "koren")
    return "root";
  if (
    lower === "mtime" ||
    lower === "date" ||
    lower === "time" ||
    lower === "cas"
  )
    return "mtime";
  if (lower === "type" || lower === "typ" || lower === "tech") return "type";
  if (lower === "files" || lower === "soubory" || lower === "count")
    return "files";
  if (lower === "git" || lower === "status") return "git";
  return "name";
}

export function normalizePath(p: string): string {
  const norm = normalize(resolve(p)).replace(/\\/g, "/");
  // Keep drive letter root intact, e.g. "D:/" or "/"
  if (norm.length > 3 && norm.endsWith("/")) {
    return norm.slice(0, -1);
  }
  return norm;
}

export function getDefaultRoots(): string[] {
  const candidates = [
    "D:/01_programovani",
    "C:/01_programovani",
    join(homedir(), "projects"),
    join(homedir(), "workspace"),
    join(homedir(), "dev"),
  ];

  const valid = candidates
    .map((c) => normalizePath(c))
    .filter((c) => {
      try {
        return existsSync(c);
      } catch {
        return false;
      }
    });

  const first = valid[0];
  if (first) {
    return [first];
  }

  // Fallback to parent of current working directory
  const parent = dirname(process.cwd());
  return [normalizePath(parent)];
}

export function getDefaultConfig(): ProjectsConfig {
  return {
    roots: getDefaultRoots(),
    manualProjects: [],
    excludedPaths: [],
    pinnedPaths: [],
    maxDepth: 5,
    prependToAtAutocomplete: true,
    rescanIntervalMinutes: 30,
    sortBy: "name",
  };
}

/** Raw contents of one cascade layer; `{}` when absent or unreadable. */
function readLayer(path: string): Record<string, unknown> {
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    }
  } catch (err) {
    console.error(`[pi-projects] Failed to read config layer ${path}:`, err);
  }
  return {};
}

/** Layer the effective config came from, so background writes stay put. */
let originLayerPath: string | undefined;

/** Load the cascade, project overriding the global layer key by key. */
export function loadProjectsConfig(
  cwd: string | undefined = configCwd,
): ProjectsConfig {
  const globalRaw = readLayer(globalConfigPath());
  const projectPath = cwd ? projectConfigPath(cwd) : undefined;
  const projectRaw = projectPath ? readLayer(projectPath) : {};

  // The project layer wins per key; missing keys keep the global value.
  const parsed: Record<string, unknown> = { ...globalRaw, ...projectRaw };
  const defaults = getDefaultConfig();

  const config: ProjectsConfig = {
    roots: Array.isArray(parsed.roots)
      ? parsed.roots.map((r: string) => normalizePath(r))
      : defaults.roots,
    manualProjects: Array.isArray(parsed.manualProjects)
      ? (parsed.manualProjects as ProjectsConfig["manualProjects"])
      : [],
    excludedPaths: Array.isArray(parsed.excludedPaths)
      ? parsed.excludedPaths.map((p: string) => normalizePath(p))
      : [],
    pinnedPaths: Array.isArray(parsed.pinnedPaths)
      ? parsed.pinnedPaths.map((p: string) => normalizePath(p))
      : [],
    maxDepth: typeof parsed.maxDepth === "number" ? parsed.maxDepth : 5,
    prependToAtAutocomplete:
      typeof parsed.prependToAtAutocomplete === "boolean"
        ? parsed.prependToAtAutocomplete
        : true,
    rescanIntervalMinutes:
      typeof parsed.rescanIntervalMinutes === "number"
        ? parsed.rescanIntervalMinutes
        : 30,
    sortBy: normalizeSortBy(parsed.sortBy as string | undefined),
    lastScanTime:
      typeof parsed.lastScanTime === "number" ? parsed.lastScanTime : undefined,
  };

  const hasAnyLayer =
    Object.keys(globalRaw).length > 0 || Object.keys(projectRaw).length > 0;
  originLayerPath = Object.keys(projectRaw).length > 0
    ? projectPath
    : globalConfigPath();

  if (!hasAnyLayer) {
    // First run: seed the global layer so the shared registry (pi-spai) sees it.
    saveProjectsConfig(config, true);
  }
  return config;
}

function atomicWriteJson(filePath: string, data: unknown): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
  renameSync(tmpPath, filePath);
}

/** Persist into the selected layer; returns the path actually written. */
export function saveProjectsConfig(
  config: ProjectsConfig,
  isGlobal = false,
  cwd: string | undefined = configCwd,
): string {
  const target = targetConfigPath(cwd, isGlobal);
  try {
    atomicWriteJson(target, config);
  } catch (err) {
    console.error(`[pi-projects] Failed to save config to ${target}:`, err);
  }
  return target;
}

/**
 * Persist only the scan timestamp, into the layer the config was loaded from.
 * A background rescan must never create or overwrite a project config file.
 */
export function saveProjectsScanTime(lastUpdated: number): void {
  const path = originLayerPath ?? globalConfigPath();
  const raw = readLayer(path);
  raw.lastScanTime = lastUpdated;
  try {
    atomicWriteJson(path, raw);
  } catch (err) {
    console.error(`[pi-projects] Failed to save scan time to ${path}:`, err);
  }
}

export function loadCachedProjects(): ProjectsIndex | null {
  try {
    if (existsSync(cachePath())) {
      const raw = readFileSync(cachePath(), "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.projects)) {
        return parsed as ProjectsIndex;
      }
    }
  } catch {
    // Non-fatal cache miss
  }
  return null;
}

export function saveCachedProjects(index: ProjectsIndex): void {
  try {
    atomicWriteJson(cachePath(), index);
  } catch (err) {
    console.error("[pi-projects] Failed to save cache:", err);
  }
}
