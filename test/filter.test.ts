import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterProjects } from "../src/scanner.js";
import type { ProjectItem } from "../src/types.js";

describe("Project Filtering", () => {
  const sampleProjects: ProjectItem[] = [
    {
      id: "p1",
      name: "pi-fusion",
      path: "D:/01_programovani/pi/plugins/pi-fusion",
      rootPath: "D:/01_programovani",
      relativePath: "pi/plugins/pi-fusion",
      type: "Node.js",
      fileCount: 14,
      lastModified: 1000,
      source: "auto",
      markers: ["package.json"],
    },
    {
      id: "p2",
      name: "pi-projects",
      path: "D:/01_programovani/pi/plugins/pi-projects",
      rootPath: "D:/01_programovani",
      relativePath: "pi/plugins/pi-projects",
      type: "TypeScript",
      fileCount: 20,
      lastModified: 2000,
      source: "auto",
      markers: ["package.json", "tsconfig.json"],
    },
    {
      id: "p3",
      name: "cedinia",
      path: "D:/01_programovani/tipsv2/cedinia",
      rootPath: "D:/01_programovani",
      relativePath: "tipsv2/cedinia",
      type: "Rust",
      fileCount: 17,
      lastModified: 3000,
      source: "auto",
      markers: ["Cargo.toml"],
    },
    {
      id: "p4",
      name: "my-mobile-app",
      path: "C:/workspace/my-mobile-app",
      rootPath: "C:/workspace",
      relativePath: "my-mobile-app",
      type: "Flutter/Dart",
      fileCount: 80,
      lastModified: 4000,
      source: "auto",
      markers: ["pubspec.yaml"],
    },
  ];

  it("filters by project name substring", () => {
    const res = filterProjects(sampleProjects, { name: "pi-" });
    assert.equal(res.length, 2);
    assert.ok(res.some((p) => p.name === "pi-fusion"));
    assert.ok(res.some((p) => p.name === "pi-projects"));
  });

  it("filters by source root path", () => {
    const res = filterProjects(sampleProjects, { root: "workspace" });
    assert.equal(res.length, 1);
    assert.equal(res[0]?.name, "my-mobile-app");
  });

  it("filters by project type", () => {
    const res = filterProjects(sampleProjects, { type: "Rust" });
    assert.equal(res.length, 1);
    assert.equal(res[0]?.name, "cedinia");
  });

  it("filters by combined name and root", () => {
    const res = filterProjects(sampleProjects, {
      name: "pi-",
      root: "01_programovani",
    });
    assert.equal(res.length, 2);
  });
});
