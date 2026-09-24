// Project index rescan.
import { saveCachedProjects, saveProjectsScanTime } from "./config.js";
import { scanAllRoots } from "./scanner.js";
import { projects } from "./state.js";
import type { ProjectsIndex } from "./types.js";

export async function refreshProjectsIndex(
  signal?: AbortSignal,
  notifyCb?: (msg: string) => void,
): Promise<ProjectsIndex> {
  if (projects.isScanning) return projects.index;
  projects.isScanning = true;

  try {
    const updated = await scanAllRoots(projects.config, signal);
    projects.index = updated;
    projects.config.lastScanTime = updated.lastUpdated;
    saveProjectsScanTime(updated.lastUpdated);
    saveCachedProjects(updated);
    if (notifyCb) {
      notifyCb(
        `Index aktualizován: nalezeno ${updated.projects.length} projektů`,
      );
    }
    return updated;
  } finally {
    projects.isScanning = false;
  }
}
