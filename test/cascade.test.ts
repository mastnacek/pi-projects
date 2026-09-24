import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cachePath,
  globalConfigPath,
  loadProjectsConfig,
  normalizePath,
  projectConfigPath,
  saveProjectsConfig,
  saveProjectsScanTime,
  setConfigCwd,
  targetConfigPath,
} from "../src/config.js";

interface Item {
  value: string;
  label: string;
  description?: string;
}

describe("pi-projects config cascade", () => {
  let root: string;
  let agentDir: string;
  let projectDir: string;
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "pi-projects-cascade-"));
    agentDir = join(root, "agent");
    projectDir = join(root, "project");
    mkdirSync(agentDir, { recursive: true });
    mkdirSync(join(projectDir, ".pi"), { recursive: true });
    process.env.PI_CODING_AGENT_DIR = agentDir;
    setConfigCwd(undefined);
  });

  afterEach(() => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    setConfigCwd(undefined);
    rmSync(root, { recursive: true, force: true });
  });

  it("seeds the global layer on first run and leaves the project layer alone", () => {
    const config = loadProjectsConfig(projectDir);
    assert.ok(config.roots.length > 0, "defaults must supply roots");
    assert.ok(existsSync(globalConfigPath()), "the first run must seed the global layer");
    assert.strictEqual(
      existsSync(projectConfigPath(projectDir)),
      false,
      "the first run must not create a project config",
    );
  });

  it("lets the project layer override the global layer key by key", () => {
    writeFileSync(
      globalConfigPath(),
      JSON.stringify({ sortBy: "name", maxDepth: 9, roots: ["D:/01_programovani"] }),
      "utf8",
    );
    writeFileSync(projectConfigPath(projectDir), JSON.stringify({ maxDepth: 3 }), "utf8");

    const config = loadProjectsConfig(projectDir);
    assert.strictEqual(config.maxDepth, 3, "the project layer must win");
    assert.strictEqual(config.sortBy, "name", "untouched global keys must survive");
    assert.deepStrictEqual(config.roots, [normalizePath("D:/01_programovani")]);
  });

  it("writes the layer selected by --global", () => {
    const config = loadProjectsConfig(projectDir);
    config.maxDepth = 2;

    assert.strictEqual(saveProjectsConfig(config, true, projectDir), globalConfigPath());
    assert.strictEqual(
      JSON.parse(readFileSync(globalConfigPath(), "utf8")).maxDepth,
      2,
      "--global must write the global layer",
    );

    assert.strictEqual(saveProjectsConfig(config, false, projectDir), projectConfigPath(projectDir));
    assert.strictEqual(targetConfigPath(projectDir, true), globalConfigPath());
    assert.strictEqual(targetConfigPath(projectDir, false), projectConfigPath(projectDir));
  });

  it("defaults to the project layer for the session cwd", () => {
    setConfigCwd(projectDir);
    const config = loadProjectsConfig();
    const written = saveProjectsConfig(config);
    assert.strictEqual(
      written,
      projectConfigPath(projectDir),
      "without --global the project layer is written",
    );
  });

  it("keeps the rescan timestamp in the layer the config came from", () => {
    writeFileSync(projectConfigPath(projectDir), JSON.stringify({ maxDepth: 2 }), "utf8");
    setConfigCwd(projectDir);
    loadProjectsConfig();

    saveProjectsScanTime(123456);
    assert.strictEqual(
      JSON.parse(readFileSync(projectConfigPath(projectDir), "utf8")).lastScanTime,
      123456,
      "a background rescan must not rewrite the merged config elsewhere",
    );
    assert.strictEqual(
      existsSync(globalConfigPath()),
      false,
      "a rescan must never create the global layer",
    );
  });

  it("keeps the derived cache out of the cascade", () => {
    assert.strictEqual(cachePath(), join(agentDir, "pi-projects-cache.json"));
    assert.notStrictEqual(cachePath(), projectConfigPath(projectDir));
  });
});

describe("pi-projects --global completions", () => {
  async function loadCompletions() {
    const commands: Record<string, { getArgumentCompletions: (prefix: string) => Promise<Item[] | null> }> = {};
    const pi = new Proxy(
      {},
      {
        get: (_target, prop) => {
          if (prop === "registerCommand") {
            return (name: string, def: { getArgumentCompletions: (prefix: string) => Promise<Item[] | null> }) => {
              commands[name] = def;
            };
          }
          if (prop === "on") return () => () => {};
          return () => {};
        },
      },
    );
    const mod = await import("../index.js");
    (mod.default as unknown as (api: unknown) => void)(pi);
    return { complete: commands["projects"]!.getArgumentCompletions, commands };
  }

  it("offers --global at the first level as a non-terminal row", async () => {
    const { complete } = await loadCompletions();
    const row = ((await complete("")) ?? []).find((i) => i.label === "--global");
    assert.ok(row, "--global row missing");
    assert.strictEqual(row!.value, "--global ", "non-terminal rows must end with a space");
  });

  it("returns only the flag row for a bare --global", async () => {
    const { complete } = await loadCompletions();
    assert.deepStrictEqual(((await complete("--global")) ?? []).map((i) => i.value), ["--global "]);
  });

  it("re-prefixes every child value exactly once", async () => {
    const { complete } = await loadCompletions();
    const items = (await complete("--global ")) ?? [];
    assert.ok(items.length > 0, "expected suggestions under --global");
    for (const item of items) {
      assert.ok(item.value.startsWith("--global "), `unprefixed value: ${item.value}`);
      assert.ok(!item.value.slice(8).startsWith("--global"), `nested flag: ${item.value}`);
    }
    const list = items.find((i) => i.label === "list");
    assert.strictEqual(list!.value, "--global list ", "non-terminal leaves keep their trailing space");
  });

  it("registers the proj alias with the same handler and completions", async () => {
    const { commands } = await loadCompletions();
    assert.ok(commands["proj"], "the /proj alias must be registered");
    assert.strictEqual(
      commands["proj"]!.getArgumentCompletions,
      commands["projects"]!.getArgumentCompletions,
    );
  });
});
