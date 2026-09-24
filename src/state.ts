// Shared mutable project state.
//
// A module-level `let` cannot be reassigned from another module, so the
// session state lives in one object that every slice imports.
import { loadCachedProjects, loadProjectsConfig } from "./config.js";
import type { ProjectsConfig, ProjectsIndex } from "./types.js";

export interface ProjectsState {
  config: ProjectsConfig;
  index: ProjectsIndex;
  isScanning: boolean;
}

export const projects: ProjectsState = {
  config: loadProjectsConfig(),
  index: loadCachedProjects() || {
    projects: [],
    lastUpdated: 0,
    rootsScanned: [],
  },
  isScanning: false,
};
