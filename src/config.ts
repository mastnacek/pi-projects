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

const CONFIG_PATH = join(homedir(), ".pi", "agent", "pi-projects.json");
const CACHE_PATH = join(homedir(), ".pi", "agent", "pi-projects-cache.json");

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
    maxDepth: 5,
    prependToAtAutocomplete: true,
    rescanIntervalMinutes: 30,
  };
}

export function loadProjectsConfig(): ProjectsConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = readFileSync(CONFIG_PATH, "utf8");
      const parsed = JSON.parse(raw);
      const defaults = getDefaultConfig();

      return {
        roots: Array.isArray(parsed.roots)
          ? parsed.roots.map((r: string) => normalizePath(r))
          : defaults.roots,
        manualProjects: Array.isArray(parsed.manualProjects)
          ? parsed.manualProjects
          : [],
        excludedPaths: Array.isArray(parsed.excludedPaths)
          ? parsed.excludedPaths.map((p: string) => normalizePath(p))
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
        lastScanTime: parsed.lastScanTime,
      };
    }
  } catch (err) {
    console.error("[pi-projects] Failed to load config:", err);
  }

  const def = getDefaultConfig();
  saveProjectsConfig(def);
  return def;
}

function atomicWriteJson(filePath: string, data: unknown): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
  renameSync(tmpPath, filePath);
}

export function saveProjectsConfig(config: ProjectsConfig): void {
  try {
    atomicWriteJson(CONFIG_PATH, config);
  } catch (err) {
    console.error("[pi-projects] Failed to save config:", err);
  }
}

export function loadCachedProjects(): ProjectsIndex | null {
  try {
    if (existsSync(CACHE_PATH)) {
      const raw = readFileSync(CACHE_PATH, "utf8");
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
    atomicWriteJson(CACHE_PATH, index);
  } catch (err) {
    console.error("[pi-projects] Failed to save cache:", err);
  }
}
