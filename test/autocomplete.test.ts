import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
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

  it("formats AutocompleteItem with @ prefix and directory trailing slash", () => {
    const item = formatProjectAutocompleteItem(sampleProjects[0]!, false);
    assert.equal(item.value, "@D:/01_programovani/pi/plugins/pi-spai/");
    assert.equal(item.label, "📁 pi-spai/");
    assert.ok(item.description?.includes("[TypeScript]"));

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
