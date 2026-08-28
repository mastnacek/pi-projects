import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { getFastGitBranchFallback, readGitInfo } from "../src/git.js";

describe("Git Status Reader", () => {
  const testRoot = join(tmpdir(), `pi-projects-test-git-${Date.now()}`);

  it("extracts branch from .git/HEAD fallback", () => {
    const gitDir = join(testRoot, "repo1", ".git");
    mkdirSync(gitDir, { recursive: true });
    writeFileSync(join(gitDir, "HEAD"), "ref: refs/heads/feature/cool-stuff\n");

    const branch = getFastGitBranchFallback(gitDir);
    assert.equal(branch, "feature/cool-stuff");
  });

  it("returns null for non-git directory", async () => {
    const nonGit = join(testRoot, "non-git");
    mkdirSync(nonGit, { recursive: true });

    const info = await readGitInfo(nonGit);
    assert.equal(info, null);

    // Cleanup
    try {
      rmSync(testRoot, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });
});
