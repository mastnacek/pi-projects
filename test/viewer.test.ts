import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
    buildProjectTree,
    getTreePrefix,
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

    it("builds hierarchical tree nodes with folder compaction and subproject counts", () => {
        const sample: ProjectItem[] = [
            {
                id: "p1",
                name: "pi-projects",
                path: "D:/01_programovani/pi/plugins/pi-projects",
                rootPath: "D:/01_programovani",
                relativePath: "pi/plugins/pi-projects",
                type: "TypeScript",
                fileCount: 20,
                lastModified: 1000,
                source: "auto",
                markers: ["package.json"],
            },
            {
                id: "p2",
                name: "pi-apple-rada",
                path: "D:/01_programovani/pi/plugins/pi-apple-rada",
                rootPath: "D:/01_programovani",
                relativePath: "pi/plugins/pi-apple-rada",
                type: "TypeScript",
                fileCount: 15,
                lastModified: 2000,
                source: "auto",
                markers: ["package.json"],
            },
            {
                id: "p3",
                name: "standalone-app",
                path: "D:/01_programovani/standalone-app",
                rootPath: "D:/01_programovani",
                relativePath: "standalone-app",
                type: "Rust",
                fileCount: 30,
                lastModified: 3000,
                source: "auto",
                markers: ["Cargo.toml"],
            },
        ];

        const tree = buildProjectTree(sample);

        // Tree should have 2 top-level items: compacted folder "pi/plugins" and project "standalone-app"
        assert.equal(tree.length, 2);

        const folderNode = tree.find((n) => n.name === "pi/plugins");
        assert.ok(folderNode);
        assert.equal(folderNode.isProject, false);
        assert.equal(folderNode.subprojectCount, 2);
        assert.equal(folderNode.totalFileCount, 35);
        assert.equal(folderNode.children.length, 2);
        assert.ok(
            folderNode.children.some(
                (c) => c.name === "pi-projects" && c.isProject,
            ),
        );
        assert.ok(
            folderNode.children.some(
                (c) => c.name === "pi-apple-rada" && c.isProject,
            ),
        );

        const standaloneNode = tree.find((n) => n.name === "standalone-app");
        assert.ok(standaloneNode);
        assert.equal(standaloneNode.isProject, true);
        assert.equal(standaloneNode.subprojectCount, 1);
        assert.equal(standaloneNode.children.length, 0);
    });

    it("generates correct tree branch prefixes", () => {
        assert.equal(getTreePrefix([]), "");
        assert.equal(getTreePrefix([false]), "├── ");
        assert.equal(getTreePrefix([true]), "└── ");
        assert.equal(getTreePrefix([false, false]), "│   ├── ");
        assert.equal(getTreePrefix([false, true]), "│   └── ");
        assert.equal(getTreePrefix([true, false]), "    ├── ");
        assert.equal(getTreePrefix([true, true]), "    └── ");
    });

    it("renders projects as a tree structure with folders containing subprojects", () => {
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

        // Must have at least top border, header, separator, rows, bottom border
        assert.ok(lines.length >= 8);

        // Check that all row lines (lines starting with ' │') have content
        const rowLines = lines.filter(
            (l) => l.includes("│") && !l.includes("Git / Název"),
        );

        // 4 folder rows + 5 project rows = 9 rows total in tree view
        assert.equal(rowLines.length, 9);

        // Check tree branch characters exist in output
        assert.ok(table.includes("└── "));
        assert.ok(table.includes("gfg6/"));
        assert.ok(table.includes("ai-rpg-text"));
        assert.ok(table.includes("000_inbox/Z_MANJARO/"));
        assert.ok(table.includes(".claude"));
        assert.ok(table.includes("flutter_mobile_app"));
    });

    it("renders empty message when no projects are given", () => {
        const table = renderProjectTable([]);
        assert.ok(
            table.includes("žádné projekty neodpovídají zadaným kritériím"),
        );
        assert.ok(table.includes("0 položek"));
    });
});
