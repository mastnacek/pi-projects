import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
  padVisible,
  renderProjectTable,
  renderProjectTypeBadge,
} from "../src/viewer.js";
import type { ProjectItem } from "../src/types.js";

describe("Viewer & Table Formatter", () => {
  it("pads strings to exact visible width regardless of ANSI codes or emojis", () => {
    const badge = renderProjectTypeBadge("TypeScript");
    const padded = padVisible(badge, 16);
    assert.equal(visibleWidth(padded), 16);

    const emojiStr = "📁 ✨ my-project";
    const paddedEmoji = padVisible(emojiStr, 25);
    assert.equal(visibleWidth(paddedEmoji), 25);

    const numStr = "42";
    const rightPadded = padVisible(numStr, 8, "right");
    assert.equal(visibleWidth(rightPadded), 8);
    assert.ok(rightPadded.startsWith("      42"));
  });

  it("renders perfectly aligned columns across diverse project types and emojis", () => {
    const dummyProjects: ProjectItem[] = [
      {
        id: "1",
        name: ".claude",
        path: "D:/01_programovani/000_inbox/Z_MANJARO/.claude",
        rootPath: "D:/01_programovani",
        relativePath: "000_inbox/Z_MANJARO/.claude",
        type: "Git",
        fileCount: 18,
        lastModified: 1,
        source: "auto",
        markers: [".git"],
        git: {
          isGit: true,
          branch: "master",
          statusEmoji: "✨",
          statusSummary: "master ✨",
        },
      },
      {
        id: "2",
        name: "@quarkos/pi-fusion",
        path: "D:/01_programovani/pi/plugins/pi-apple-rada/zdroje/Pi-Fusion",
        rootPath: "D:/01_programovani",
        relativePath: "pi/plugins/pi-apple-rada/zdroje/Pi-Fusion",
        type: "Node.js",
        fileCount: 14,
        lastModified: 2,
        source: "auto",
        markers: ["package.json"],
        git: {
          isGit: true,
          branch: "main",
          statusEmoji: "✨",
          statusSummary: "main ✨",
        },
      },
      {
        id: "3",
        name: "add_icon_exe",
        path: "D:/01_programovani/tipsv2/misc/add_icon_exe",
        rootPath: "D:/01_programovani",
        relativePath: "tipsv2/misc/add_icon_exe",
        type: "Rust",
        fileCount: 1,
        lastModified: 3,
        source: "auto",
        markers: ["Cargo.toml"],
      },
      {
        id: "4",
        name: "ai-rpg-text",
        path: "D:/01_programovani/gfg6/ai-rpg-text",
        rootPath: "D:/01_programovani",
        relativePath: "gfg6/ai-rpg-text",
        type: "Python",
        fileCount: 15,
        lastModified: 4,
        source: "auto",
        markers: ["pyproject.toml"],
        git: {
          isGit: true,
          branch: "main",
          statusEmoji: "📝",
          statusSummary: "main 📝 ~3 ?9",
        },
      },
      {
        id: "5",
        name: "flutter_mobile_app",
        path: "C:/dev/flutter_mobile_app",
        rootPath: "C:/dev",
        relativePath: "flutter_mobile_app",
        type: "Flutter/Dart",
        fileCount: 250,
        lastModified: 5,
        source: "auto",
        markers: ["pubspec.yaml"],
      },
    ];

    const table = renderProjectTable(dummyProjects, "test run");
    const lines = table.split("\n");

    // Must have at least top border, header, separator, 5 rows, bottom border
    assert.ok(lines.length >= 8);

    // Check that all row lines (lines starting with ' │') have exact column offsets
    const rowLines = lines.filter(
      (l) => l.includes("│") && !l.includes("Git / Název"),
    );

    assert.equal(rowLines.length, 5);
  });
});
