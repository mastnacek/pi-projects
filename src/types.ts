export type ProjectType =
  | "TypeScript"
  | "Node.js"
  | "Python"
  | "Rust"
  | "Go"
  | "C/C++"
  | "Java/Kotlin"
  | ".NET/C#"
  | "PHP"
  | "Ruby"
  | "Flutter/Dart"
  | "Swift"
  | "Git"
  | "General";

export type ProjectSource = "auto" | "manual";

export type ProjectSortBy = "name" | "mtime" | "alphabet" | "date";

export interface GitInfo {
  isGit: boolean;
  branch?: string;
  clean?: boolean;
  statusEmoji: string;
  modifiedCount?: number;
  stagedCount?: number;
  untrackedCount?: number;
  aheadCount?: number;
  behindCount?: number;
  statusSummary?: string;
}

export interface ProjectItem {
  id: string;
  name: string;
  path: string;
  rootPath?: string;
  relativePath?: string;
  type: ProjectType;
  markers: string[];
  description?: string;
  fileCount: number;
  lastModified: number;
  source: ProjectSource;
  pinned?: boolean;
  tags?: string[];
  git?: GitInfo;
}

export interface ProjectsConfig {
  roots: string[];
  manualProjects: ProjectItem[];
  excludedPaths: string[];
  pinnedPaths?: string[];
  maxDepth: number;
  prependToAtAutocomplete: boolean;
  rescanIntervalMinutes: number;
  sortBy?: ProjectSortBy;
  lastScanTime?: number;
}

export interface ProjectsIndex {
  projects: ProjectItem[];
  lastUpdated: number;
  rootsScanned: string[];
}
