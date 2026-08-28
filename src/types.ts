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
}

export interface ProjectsConfig {
  roots: string[];
  manualProjects: ProjectItem[];
  excludedPaths: string[];
  maxDepth: number;
  prependToAtAutocomplete: boolean;
  rescanIntervalMinutes: number;
  lastScanTime?: number;
}

export interface ProjectsIndex {
  projects: ProjectItem[];
  lastUpdated: number;
  rootsScanned: string[];
}
