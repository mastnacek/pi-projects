// Session lifecycle hooks.
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createProjectsAutocompleteProvider } from "./autocomplete.js";
import { loadCachedProjects, loadProjectsConfig, setConfigCwd } from "./config.js";
import { refreshProjectsIndex } from "./refresh.js";
import { projects } from "./state.js";

export function registerProjectsLifecycle(
  pi: ExtensionAPI,
  track: (result: unknown) => void,
  unsubscribers: Array<() => void>,
): void {
  track(pi.on("session_start", async (_event, ctx: ExtensionContext) => {
    // Point the config cascade at this session's project layer.
    setConfigCwd(ctx.cwd);
    projects.config = loadProjectsConfig();
    const cached = loadCachedProjects();
    if (cached) {
      projects.index = cached;
    }

    if (ctx.hasUI) {
      ctx.ui.setStatus(
        "pi-projects",
        `📁 ${projects.index.projects.length} proj`,
      );

      // Register @-autocomplete provider
      ctx.ui.addAutocompleteProvider((current) =>
        createProjectsAutocompleteProvider(
          current,
          () => projects.index.projects,
          () => projects.config.prependToAtAutocomplete,
          () => projects.config.sortBy || "name",
        ),
      );
    }

    // Trigger background rescan if cache empty or stale (> 30 min)
    const now = Date.now();
    const staleThreshold =
      (projects.config.rescanIntervalMinutes || 30) * 60 * 1000;
    if (
      projects.index.projects.length === 0 ||
      now - projects.index.lastUpdated > staleThreshold
    ) {
      void refreshProjectsIndex(undefined, () => {
        if (ctx.hasUI) {
          ctx.ui.setStatus(
            "pi-projects",
            `📁 ${projects.index.projects.length} proj`,
          );
        }
      });
    }
  }));

  // 1b. Session shutdown: drop session-scoped state so nothing stale survives
  // a session replacement (AGENTS.md §5/§6). Disk cache is left intact.
  pi.on("session_shutdown", () => {
    while (unsubscribers.length > 0) unsubscribers.pop()?.();
    projects.isScanning = false;
    projects.index = { projects: [], lastUpdated: 0, rootsScanned: [] };
  });
}
