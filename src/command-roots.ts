// /projects pin | unpin | roots subcommands.
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { normalizePath, saveProjectsConfig } from "./config.js";
import { refreshProjectsIndex } from "./refresh.js";
import { projects } from "./state.js";
import { coralGlow, greenGlow, renderRootsTable } from "./viewer.js";

export async function handleRootsSubcommand(
  sub: string,
  rest: string[],
  ctx: ExtensionCommandContext,
  isGlobal: boolean,
): Promise<void> {
  switch (sub) {
    case "pin": {
      const target = rest.join(" ").trim().toLowerCase();
      if (!target) {
        ctx.ui.notify(
          "Zadejte ID nebo název projektu: /projects pin <id|název>",
          "warning",
        );
        return;
      }
      const proj = projects.index.projects.find(
        (p) =>
          p.id.toLowerCase() === target ||
          p.name.toLowerCase() === target ||
          p.path.toLowerCase().endsWith(target),
      );
      if (!proj) {
        ctx.ui.notify(`Projekt "${target}" nebyl nalezen.`, "warning");
        return;
      }
      const normP = normalizePath(proj.path);
      projects.config.pinnedPaths = projects.config.pinnedPaths ?? [];
      if (!projects.config.pinnedPaths.includes(normP)) {
        projects.config.pinnedPaths.push(normP);
        saveProjectsConfig(projects.config, isGlobal, ctx.cwd);
        await refreshProjectsIndex();
      }
      ctx.ui.notify(
        `Projekt ${greenGlow(proj.name)} byl připnut na 1. místo! (📌)`,
        "info",
      );
      return;
    }

    case "unpin": {
      const target = rest.join(" ").trim().toLowerCase();
      if (!target) {
        ctx.ui.notify(
          "Zadejte ID nebo název projektu: /projects unpin <id|název>",
          "warning",
        );
        return;
      }
      const proj = projects.index.projects.find(
        (p) =>
          p.id.toLowerCase() === target ||
          p.name.toLowerCase() === target ||
          p.path.toLowerCase().endsWith(target),
      );
      if (!proj) {
        ctx.ui.notify(`Projekt "${target}" nebyl nalezen.`, "warning");
        return;
      }
      const normP = normalizePath(proj.path);
      projects.config.pinnedPaths = (projects.config.pinnedPaths ?? []).filter(
        (p) => p !== normP,
      );
      saveProjectsConfig(projects.config, isGlobal, ctx.cwd);
      await refreshProjectsIndex();
      ctx.ui.notify(`Projekt ${greenGlow(proj.name)} byl odepnut.`, "info");
      return;
    }

    case "roots": {
      const action = rest[0]?.toLowerCase();
      const rootArg = rest.slice(1).join(" ").trim();

      if (!action || action === "list") {
        ctx.ui.notify(
          renderRootsTable(projects.config.roots, projects.index.projects),
          "info",
        );
        return;
      }

      if (action === "add") {
        if (!rootArg) {
          ctx.ui.notify(
            "Zadejte cestu ke kořenové složce: /projects roots add <cesta>",
            "warning",
          );
          return;
        }
        const norm = normalizePath(rootArg);
        if (projects.config.roots.includes(norm)) {
          ctx.ui.notify(`Kořenová složka "${norm}" již existuje.`, "warning");
          return;
        }
        projects.config.roots.push(norm);
        saveProjectsConfig(projects.config, isGlobal, ctx.cwd);
        ctx.ui.notify(
          `Přidána kořenová složka: ${greenGlow(norm)}. Spouštím skenování...`,
          "info",
        );
        await refreshProjectsIndex(undefined, (msg) =>
          ctx.ui.notify(msg, "info"),
        );
        return;
      }

      if (action === "remove" || action === "rm") {
        if (!rootArg) {
          ctx.ui.notify(
            "Zadejte cestu ke kořenové složce: /projects roots remove <cesta>",
            "warning",
          );
          return;
        }
        const norm = normalizePath(rootArg);
        const initialLen = projects.config.roots.length;
        projects.config.roots = projects.config.roots.filter(
          (r) => normalizePath(r) !== norm,
        );
        if (projects.config.roots.length === initialLen) {
          ctx.ui.notify(
            `Kořenová složka "${norm}" nebyla v konfiguraci nalezena.`,
            "warning",
          );
          return;
        }
        saveProjectsConfig(projects.config, isGlobal, ctx.cwd);
        ctx.ui.notify(
          `Odebrána kořenová složka: ${coralGlow(norm)}. Aktualizuji index...`,
          "info",
        );
        await refreshProjectsIndex(undefined, (msg) =>
          ctx.ui.notify(msg, "info"),
        );
        return;
      }

      ctx.ui.notify(
        "Použijte: /projects roots [list | add <cesta> | remove <cesta>]",
        "warning",
      );
      return;
    }

    default:
      return;
  }
}
