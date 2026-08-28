import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { ProjectItem, ProjectType } from "./types.js";
import { normalizePath } from "./config.js";

export const IGNORED_SCAN_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "target",
  "vendor",
  "venv",
  ".venv",
  "env",
  ".env",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".tox",
  ".eggs",
  ".idea",
  ".vscode",
  ".vs",
  ".next",
  ".nuxt",
  ".turbo",
  ".svelte-kit",
  ".cache",
  "thumbnails",
  "temp",
  "tmp",
  "cache",
  "logs",
  "coverage",
  ".nyc_output",
  "Pods",
  "DerivedData",
]);

export interface DetectionResult {
  isProject: boolean;
  type: ProjectType;
  name: string;
  markers: string[];
  description?: string;
  fileCount: number;
  lastModified: number;
}

function parseJsonSafe<T>(content: string): T | null {
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

function extractTomlString(content: string, key: string): string | undefined {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(`${key}`) && trimmed.includes("=")) {
      const parts = trimmed.split("=");
      if (parts[0]?.trim() === key) {
        const val = parts.slice(1).join("=").trim();
        const unquoted = val.replace(/^["']|["']$/g, "").trim();
        if (unquoted) return unquoted;
      }
    }
  }
  return undefined;
}

function extractGoModuleName(content: string): string | undefined {
  const match = content.match(/^\s*module\s+([^\s\n]+)/m);
  return match?.[1]?.split("/").pop();
}

function extractReadmeDescription(
  dirPath: string,
  files: string[],
): string | undefined {
  const readme = files.find((f) => /^readme(\.md|\.txt|\.rst)?$/i.test(f));
  if (!readme) return undefined;

  try {
    const full = join(dirPath, readme);
    const text = readFileSync(full, "utf8");
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of lines) {
      if (line.startsWith("#")) {
        const heading = line.replace(/^#+\s*/, "").trim();
        if (heading) return heading;
      } else if (line.length > 5 && !line.startsWith("!")) {
        return line.slice(0, 120);
      }
    }
  } catch {
    // Non-fatal
  }
  return undefined;
}

export function detectProjectInDir(dirPath: string): DetectionResult | null {
  const normalized = normalizePath(dirPath);
  const dirName = basename(normalized);

  let fileNames: string[];
  try {
    fileNames = readdirSync(normalized);
  } catch {
    return null;
  }

  const fileSet = new Set(fileNames);
  const markers: string[] = [];
  let type: ProjectType | null = null;
  let projectName = dirName;
  let projectDesc: string | undefined;

  // 1. Node.js / TypeScript
  if (fileSet.has("package.json")) {
    markers.push("package.json");
    try {
      const raw = readFileSync(join(normalized, "package.json"), "utf8");
      const pkg = parseJsonSafe<{
        name?: string;
        description?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      }>(raw);

      if (pkg?.name) {
        projectName = pkg.name;
      }
      if (pkg?.description) {
        projectDesc = pkg.description;
      }

      const allDeps = {
        ...pkg?.dependencies,
        ...pkg?.devDependencies,
      };

      if (
        fileSet.has("tsconfig.json") ||
        "typescript" in allDeps ||
        "@earendil-works/pi-coding-agent" in allDeps
      ) {
        type = "TypeScript";
        if (fileSet.has("tsconfig.json")) markers.push("tsconfig.json");
      } else {
        type = "Node.js";
      }
    } catch {
      type = "Node.js";
    }
  } else if (fileSet.has("deno.json") || fileSet.has("deno.jsonc")) {
    markers.push("deno.json");
    type = "TypeScript";
  } else if (fileSet.has("bun.lockb") || fileSet.has("bunfig.toml")) {
    markers.push("bun");
    type = "TypeScript";
  }

  // 2. Rust
  if (!type && fileSet.has("Cargo.toml")) {
    markers.push("Cargo.toml");
    type = "Rust";
    try {
      const cargoText = readFileSync(join(normalized, "Cargo.toml"), "utf8");
      const name = extractTomlString(cargoText, "name");
      const desc = extractTomlString(cargoText, "description");
      if (name) projectName = name;
      if (desc) projectDesc = desc;
    } catch {
      // Keep defaults
    }
  }

  // 3. Python
  const pythonMarkers = [
    "pyproject.toml",
    "setup.py",
    "setup.cfg",
    "requirements.txt",
    "Pipfile",
    "poetry.lock",
    "tox.ini",
    "manage.py",
  ];
  const foundPy = pythonMarkers.filter((m) => fileSet.has(m));
  if (!type && foundPy.length > 0) {
    markers.push(...foundPy);
    type = "Python";
    if (fileSet.has("pyproject.toml")) {
      try {
        const pyText = readFileSync(join(normalized, "pyproject.toml"), "utf8");
        const name = extractTomlString(pyText, "name");
        const desc = extractTomlString(pyText, "description");
        if (name) projectName = name;
        if (desc) projectDesc = desc;
      } catch {
        // Keep defaults
      }
    }
  }

  // 4. Go
  if (!type && fileSet.has("go.mod")) {
    markers.push("go.mod");
    type = "Go";
    try {
      const goText = readFileSync(join(normalized, "go.mod"), "utf8");
      const modName = extractGoModuleName(goText);
      if (modName) projectName = modName;
    } catch {
      // Keep defaults
    }
  }

  // 5. C / C++
  const cppMarkers = [
    "CMakeLists.txt",
    "Makefile",
    "meson.build",
    "configure.ac",
  ];
  const foundCpp = cppMarkers.filter((m) => fileSet.has(m));
  if (!type && foundCpp.length > 0) {
    markers.push(...foundCpp);
    type = "C/C++";
  }

  // 6. Java / Kotlin
  const javaMarkers = [
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "settings.gradle",
  ];
  const foundJava = javaMarkers.filter((m) => fileSet.has(m));
  if (!type && foundJava.length > 0) {
    markers.push(...foundJava);
    type = "Java/Kotlin";
  }

  // 7. .NET / C#
  const dotNetFile = fileNames.find(
    (f) => f.endsWith(".sln") || f.endsWith(".csproj") || f.endsWith(".fsproj"),
  );
  if (!type && dotNetFile) {
    markers.push(dotNetFile);
    type = ".NET/C#";
  }

  // 8. PHP
  if (!type && fileSet.has("composer.json")) {
    markers.push("composer.json");
    type = "PHP";
  }

  // 9. Ruby
  if (!type && fileSet.has("Gemfile")) {
    markers.push("Gemfile");
    type = "Ruby";
  }

  // 10. Flutter / Dart
  if (!type && fileSet.has("pubspec.yaml")) {
    markers.push("pubspec.yaml");
    type = "Flutter/Dart";
  }

  // 11. Swift
  if (
    !type &&
    (fileSet.has("Package.swift") ||
      fileNames.some((f) => f.endsWith(".xcodeproj")))
  ) {
    markers.push("Package.swift");
    type = "Swift";
  }

  // 12. Git repo
  if (fileSet.has(".git")) {
    markers.push(".git");
    if (!type) {
      type = "Git";
    }
  }

  // 13. General project (has README/LICENSE and source dirs/files)
  if (!type) {
    const hasDoc =
      fileSet.has("README.md") ||
      fileSet.has("README.txt") ||
      fileSet.has("readme.md") ||
      fileSet.has("LICENSE");
    const hasSrc =
      fileSet.has("src") ||
      fileSet.has("lib") ||
      fileSet.has("docs") ||
      fileSet.has("app") ||
      fileSet.has("pkg");
    if (hasDoc && hasSrc) {
      markers.push("README.md");
      type = "General";
    }
  }

  if (!type) {
    return null;
  }

  if (!projectDesc) {
    projectDesc = extractReadmeDescription(normalized, fileNames);
  }

  // Calculate file count and last modified time
  let fileCount = 0;
  let maxMtime = 0;

  try {
    const dirStat = statSync(normalized);
    maxMtime = dirStat.mtimeMs;

    for (const name of fileNames) {
      if (IGNORED_SCAN_DIRS.has(name)) continue;
      const fullPath = join(normalized, name);
      try {
        const st = statSync(fullPath);
        if (st.isFile()) {
          fileCount++;
          if (st.mtimeMs > maxMtime) maxMtime = st.mtimeMs;
        } else if (st.isDirectory()) {
          fileCount++;
        }
      } catch {
        // Skip unreadable
      }
    }
  } catch {
    // Keep 0
  }

  return {
    isProject: true,
    type,
    name: projectName,
    markers,
    description: projectDesc,
    fileCount,
    lastModified: maxMtime || Date.now(),
  };
}

export function createProjectItem(
  dirPath: string,
  rootPath?: string,
  source: "auto" | "manual" = "auto",
): ProjectItem | null {
  const normPath = normalizePath(dirPath);
  const detected = detectProjectInDir(normPath);
  if (!detected) return null;

  const id = detected.name.toLowerCase().replace(/[^a-z0-9_-]/g, "-");

  let relativePath: string | undefined;
  if (rootPath) {
    const normRoot = normalizePath(rootPath);
    if (normPath.startsWith(normRoot)) {
      relativePath = normPath.slice(normRoot.length).replace(/^\/+/, "");
    }
  }

  return {
    id,
    name: detected.name,
    path: normPath,
    rootPath: rootPath ? normalizePath(rootPath) : undefined,
    relativePath,
    type: detected.type,
    markers: detected.markers,
    description: detected.description,
    fileCount: detected.fileCount,
    lastModified: detected.lastModified,
    source,
  };
}
