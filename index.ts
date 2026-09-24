// pi-projects — composition root.
//
// Config cascade (lowest priority first):
//   defaults <- ~/.pi/agent/pi-projects.json <- <cwd>/.pi/pi-projects.json
// `--global` writes the global layer; without it the project layer is written.
// The global file is a shared registry: pi-spai reads the same cascade.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { handleProjectsCommand } from "./src/command.js";
import { getProjectsArgumentCompletions } from "./src/completions.js";
import { registerProjectsLifecycle } from "./src/lifecycle.js";
import { registerProjectsTools } from "./src/tools.js";

export default function (pi: ExtensionAPI): void {
  /** Unsubscribers from every `pi.on()`; drained on session_shutdown (AGENTS §5). */
  const unsubscribers: Array<() => void> = [];

  /** Retain a `pi.on()` return value; older engine typings declare it void. */
  const track = (result: unknown): void => {
    if (typeof result === "function") unsubscribers.push(result as () => void);
  };

  registerProjectsLifecycle(pi, track, unsubscribers);
  registerProjectsTools(pi);

  pi.registerCommand("projects", {
    description: "Správa a index projektů, kořenových složek a @-našeptávání",
    getArgumentCompletions: getProjectsArgumentCompletions,
    handler: handleProjectsCommand,
  });

  pi.registerCommand("proj", {
    description: "Zkrácený alias pro /projects",
    getArgumentCompletions: getProjectsArgumentCompletions,
    handler: handleProjectsCommand,
  });
}

