import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sortProjects } from "../src/scanner.js";
import type { ProjectItem } from "../src/types.js";

describe("Project Sorting", () => {
  const sampleProjects: ProjectItem[] = [
    {
      id: "p1",
      name: "zebra-tool",
      path: "D:/01_programovani/zebra-tool",
      rootPath: "D:/01_programovani",
      type: "Python",
      fileCount: 50,
      lastModified: 1000,
      source: "auto",
      markers: ["pyproject.toml"],
    },
    {
      id: "p2",
      name: "alpha-core",
      path: "C:/dev/alpha-core",
      rootPath: "C:/dev",
      type: "Rust",
      fileCount: 10,
      lastModified: 5000,
      source: "auto",
      markers: ["Cargo.toml"],
    },
    {
      id: "p3",
      name: "beta-service",
      path: "D:/01_programovani/beta-service",
      rootPath: "D:/01_programovani",
      type: "TypeScript",
      fileCount: 120,
      lastModified: 3000,
      source: "auto",
      markers: ["package.json"],
    },
    {
      id: "p4",
      name: "pinned-app",
      path: "C:/dev/pinned-app",
      rootPath: "C:/dev",
      type: "Go",
      fileCount: 5,
      lastModified: 2000,
      source: "auto",
      markers: ["go.mod"],
      pinned: true,
    },
  ];

  it("sorts by project name (A-Z) with pinned first", () => {
    const sorted = sortProjects(sampleProjects, "name");
    assert.equal(sorted[0]?.name, "pinned-app"); // Pinned first
    assert.equal(sorted[1]?.name, "alpha-core");
    assert.equal(sorted[2]?.name, "beta-service");
    assert.equal(sorted[3]?.name, "zebra-tool");
  });

  it("sorts by source root folder with pinned first", () => {
    const sorted = sortProjects(sampleProjects, "root");
    assert.equal(sorted[0]?.name, "pinned-app"); // Pinned first
    // C:/dev projects come before D:/01_programovani
    assert.equal(sorted[1]?.name, "alpha-core"); // in C:/dev
    assert.equal(sorted[2]?.name, "beta-service"); // in D:/...
    assert.equal(sorted[3]?.name, "zebra-tool"); // in D:/...
  });

  it("sorts by modification date (mtime) with pinned first", () => {
    const sorted = sortProjects(sampleProjects, "mtime");
    assert.equal(sorted[0]?.name, "pinned-app"); // Pinned first
    assert.equal(sorted[1]?.name, "alpha-core"); // 5000
    assert.equal(sorted[2]?.name, "beta-service"); // 3000
    assert.equal(sorted[3]?.name, "zebra-tool"); // 1000
  });

  it("sorts by file count (files) with pinned first", () => {
    const sorted = sortProjects(sampleProjects, "files");
    assert.equal(sorted[0]?.name, "pinned-app"); // Pinned first
    assert.equal(sorted[1]?.name, "beta-service"); // 120 files
    assert.equal(sorted[2]?.name, "zebra-tool"); // 50 files
    assert.equal(sorted[3]?.name, "alpha-core"); // 10 files
  });

  it("sorts by project type with pinned first", () => {
    const sorted = sortProjects(sampleProjects, "type");
    assert.equal(sorted[0]?.name, "pinned-app"); // Pinned first
    assert.equal(sorted[1]?.type, "Python");
    assert.equal(sorted[2]?.type, "Rust");
    assert.equal(sorted[3]?.type, "TypeScript");
  });
});
