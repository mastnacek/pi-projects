import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createProjectItem, detectProjectInDir } from "../src/detector.js";

describe("Project Detector", () => {
  const testRoot = join(tmpdir(), `pi-projects-test-detector-${Date.now()}`);

  it("detects Node.js & TypeScript project", () => {
    const projDir = join(testRoot, "my-ts-app");
    mkdirSync(projDir, { recursive: true });
    writeFileSync(
      join(projDir, "package.json"),
      JSON.stringify({
        name: "my-ts-app",
        description: "Test App",
        devDependencies: { typescript: "^5.0.0" },
      }),
    );
    writeFileSync(join(projDir, "tsconfig.json"), "{}");

    const res = detectProjectInDir(projDir);
    assert.ok(res);
    assert.equal(res.name, "my-ts-app");
    assert.equal(res.type, "TypeScript");
    assert.ok(res.markers.includes("package.json"));
    assert.ok(res.markers.includes("tsconfig.json"));

    const item = createProjectItem(projDir, testRoot, "auto");
    assert.ok(item);
    assert.equal(item.name, "my-ts-app");
    assert.equal(item.relativePath, "my-ts-app");
  });

  it("detects Rust project", () => {
    const projDir = join(testRoot, "my-rust-crate");
    mkdirSync(projDir, { recursive: true });
    writeFileSync(
      join(projDir, "Cargo.toml"),
      '[package]\nname = "my-rust-crate"\nversion = "0.1.0"\ndescription = "Rust tool"\n',
    );

    const res = detectProjectInDir(projDir);
    assert.ok(res);
    assert.equal(res.name, "my-rust-crate");
    assert.equal(res.type, "Rust");
    assert.equal(res.description, "Rust tool");
  });

  it("detects Python project", () => {
    const projDir = join(testRoot, "my-python-pkg");
    mkdirSync(projDir, { recursive: true });
    writeFileSync(
      join(projDir, "pyproject.toml"),
      '[project]\nname = "my-py-app"\ndescription = "Python app"\n',
    );

    const res = detectProjectInDir(projDir);
    assert.ok(res);
    assert.equal(res.name, "my-py-app");
    assert.equal(res.type, "Python");
  });

  it("returns null for non-project empty dir", () => {
    const emptyDir = join(testRoot, "empty-folder");
    mkdirSync(emptyDir, { recursive: true });

    const res = detectProjectInDir(emptyDir);
    assert.equal(res, null);

    // Cleanup
    try {
      rmSync(testRoot, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });
});
