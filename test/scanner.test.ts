import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { scanAllRoots, scanRootFolder } from "../src/scanner.js";
import type { ProjectsConfig } from "../src/types.js";

describe("Project Scanner", () => {
  const testRoot = join(tmpdir(), `pi-projects-test-scanner-${Date.now()}`);

  it("scans nested root folders and identifies multiple subprojects", async () => {
    // Structure:
    // testRoot/
    //   plugins/
    //     plugin-a/ (package.json)
    //     plugin-b/ (Cargo.toml)
    //     node_modules/
    //       sub/ (should be ignored)
    //   apps/
    //     python-app/ (pyproject.toml)

    const pluginA = join(testRoot, "plugins", "plugin-a");
    const pluginB = join(testRoot, "plugins", "plugin-b");
    const ignoredMod = join(testRoot, "plugins", "node_modules", "sub-pkg");
    const pyApp = join(testRoot, "apps", "python-app");

    mkdirSync(pluginA, { recursive: true });
    mkdirSync(pluginB, { recursive: true });
    mkdirSync(ignoredMod, { recursive: true });
    mkdirSync(pyApp, { recursive: true });

    writeFileSync(
      join(pluginA, "package.json"),
      JSON.stringify({ name: "plugin-a" }),
    );
    writeFileSync(
      join(pluginB, "Cargo.toml"),
      '[package]\nname = "plugin-b"\n',
    );
    writeFileSync(
      join(ignoredMod, "package.json"),
      JSON.stringify({ name: "ignored" }),
    );
    writeFileSync(
      join(pyApp, "pyproject.toml"),
      '[project]\nname = "py-app"\n',
    );

    const config: ProjectsConfig = {
      roots: [testRoot],
      manualProjects: [],
      excludedPaths: [],
      maxDepth: 5,
      prependToAtAutocomplete: true,
      rescanIntervalMinutes: 30,
    };

    const found = await scanRootFolder(testRoot, config);
    assert.equal(found.length, 3);
    const names = found.map((f) => f.name).sort();
    assert.deepEqual(names, ["plugin-a", "plugin-b", "py-app"]);

    const index = await scanAllRoots(config);
    assert.equal(index.projects.length, 3);

    // Cleanup
    try {
      rmSync(testRoot, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });
});
