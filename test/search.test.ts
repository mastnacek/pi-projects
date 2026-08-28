import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { searchAndRankProjects } from "../src/scanner.js";
import type { ProjectItem } from "../src/types.js";

describe("Project Search & Ranking", () => {
  const sampleProjects: ProjectItem[] = [
    {
      id: "p1",
      name: "car-scraper-mcp",
      path: "D:/01_programovani/mcp/auta",
      rootPath: "D:/01_programovani",
      relativePath: "mcp/auta",
      type: "Python",
      fileCount: 17,
      lastModified: 1000,
      source: "auto",
      markers: ["pyproject.toml"],
      description: "Fast MCP server for scraping car listings",
    },
    {
      id: "p2",
      name: "cedinia",
      path: "D:/01_programovani/tipsv2/cedinia",
      rootPath: "D:/01_programovani",
      relativePath: "tipsv2/cedinia",
      type: "Rust",
      fileCount: 17,
      lastModified: 2000,
      source: "auto",
      markers: ["Cargo.toml"],
      description: "Rust duplicate file cleaner",
    },
    {
      id: "p3",
      name: "ai-rpg-text",
      path: "D:/01_programovani/gfg6/ai-rpg-text",
      rootPath: "D:/01_programovani",
      relativePath: "gfg6/ai-rpg-text",
      type: "Python",
      fileCount: 15,
      lastModified: 3000,
      source: "auto",
      markers: ["pyproject.toml"],
      description: "RPG text adventure with AI narration",
    },
  ];

  it("finds projects by exact or partial name", () => {
    const res = searchAndRankProjects(sampleProjects, "scraper");
    assert.equal(res.length, 1);
    assert.equal(res[0]?.project.name, "car-scraper-mcp");
    assert.ok(res[0]?.score && res[0].score > 0);
  });

  it("finds projects by technology type", () => {
    const res = searchAndRankProjects(sampleProjects, "rust");
    assert.equal(res.length, 1);
    assert.equal(res[0]?.project.name, "cedinia");
  });

  it("finds projects by description content", () => {
    const res = searchAndRankProjects(sampleProjects, "adventure");
    assert.equal(res.length, 1);
    assert.equal(res[0]?.project.name, "ai-rpg-text");
  });

  it("handles multi-term queries requiring all terms to match", () => {
    const res = searchAndRankProjects(sampleProjects, "python scraper");
    assert.equal(res.length, 1);
    assert.equal(res[0]?.project.name, "car-scraper-mcp");

    const none = searchAndRankProjects(sampleProjects, "rust adventure");
    assert.equal(none.length, 0);
  });
});
