import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  abbreviateRootOrigin,
  filterProjectsForAutocomplete,
  formatProjectAutocompleteItem,
} from "../src/autocomplete.js";
import type { ProjectItem } from "../src/types.js";

describe("Autocomplete Provider", () => {
  const sampleProjects: ProjectItem[] = [
    {
      id: "pi-spai",
      name: "pi-spai",
      path: "D:/01_programovani/pi/plugins/pi-spai",
      relativePath: "pi-spai",
      type: "TypeScript",
      markers: ["package.json"],
      fileCount: 15,
      lastModified: 1000,
      source: "auto",
    },
    {
      id: "mozek-rust",
      name: "mozek_rust",
      path: "D:/01_programovani/mozek_rust",
      type: "Rust",
      markers: ["Cargo.toml"],
      fileCount: 42,
      lastModified: 2000,
      source: "auto",
    },
    {
      id: "duproject",
      name: "Duproject",
      path: "D:/01_programovani/Duproject",
      type: "Python",
      markers: ["pyproject.toml"],
      fileCount: 10,
      lastModified: 1500,
      source: "manual",
    },
  ];

  it("filters projects by prefix query", () => {
    const res = filterProjectsForAutocomplete(sampleProjects, "spai");
    assert.equal(res.length, 1);
    assert.equal(res[0]?.name, "pi-spai");

    const rustRes = filterProjectsForAutocomplete(sampleProjects, "rust");
    assert.equal(rustRes.length, 1);
    assert.equal(rustRes[0]?.name, "mozek_rust");
  });

  it("sorts projects alphabetically when query is empty (@)", () => {
    const res = filterProjectsForAutocomplete(sampleProjects, "", 25, "name");
    assert.equal(res.length, 3);
    assert.equal(res[0]?.name, "Duproject");
    assert.equal(res[1]?.name, "mozek_rust");
    assert.equal(res[2]?.name, "pi-spai");
  });

  it("sorts projects by modification date when sortBy is mtime", () => {
    const res = filterProjectsForAutocomplete(sampleProjects, "", 25, "mtime");
    assert.equal(res.length, 3);
    assert.equal(res[0]?.name, "mozek_rust"); // mtime 2000
    assert.equal(res[1]?.name, "Duproject"); // mtime 1500
    assert.equal(res[2]?.name, "pi-spai"); // mtime 1000
  });

  it("abbreviates root origin path", () => {
    assert.equal(abbreviateRootOrigin("D:/01_programovani"), "D:01_prog");
    assert.equal(
      abbreviateRootOrigin("C:/Users/jaroslav/projects"),
      "C:projects",
    );
    assert.equal(abbreviateRootOrigin("D:/my-big-workspace"), "D:my-big-work");
    assert.equal(abbreviateRootOrigin(undefined, "manual"), "manual");
  });

  it("formats AutocompleteItem with @ prefix, root origin tag, and directory trailing slash", () => {
    const item = formatProjectAutocompleteItem(
      {
        ...sampleProjects[0]!,
        rootPath: "D:/01_programovani",
      },
      false,
    );
    assert.equal(item.value, "@D:/01_programovani/pi/plugins/pi-spai/");
    assert.equal(item.label, "📁 pi-spai/ [D:01_prog]");
    assert.ok(item.description?.includes("[D:01_prog]"));
    assert.ok(item.description?.includes("[TypeScript]"));

    const itemWithGit = formatProjectAutocompleteItem(
      {
        ...sampleProjects[0]!,
        rootPath: "D:/01_programovani",
        git: {
          isGit: true,
          branch: "main",
          clean: true,
          statusEmoji: "✨",
          statusSummary: "main ✨",
        },
      },
      false,
    );
    assert.equal(itemWithGit.label, "📁 pi-spai/ (main ✨) [D:01_prog]");
    assert.ok(itemWithGit.description?.includes("[D:01_prog]"));
    assert.ok(itemWithGit.description?.includes("[main ✨]"));

    const quotedItem = formatProjectAutocompleteItem(
      {
        ...sampleProjects[0]!,
        path: "D:/My Projects/app",
      },
      false,
    );
    assert.equal(quotedItem.value, '@"D:/My Projects/app/"');
  });
});
