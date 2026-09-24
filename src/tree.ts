// Extracted from viewer.ts to keep modules focused.


import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
	ProjectItem,
} from "./types.js";
import {
	normalizePath,
} from "./config.js";

export interface ProjectTreeNode {
  name: string;
  segment: string;
  path: string;
  relativePath?: string;
  rootPath?: string;
  source: "auto" | "manual";
  isProject: boolean;
  project?: ProjectItem;
  subprojectCount: number;
  totalFileCount: number;
  hasChanges: boolean;
  minOriginalIndex: number;
  children: ProjectTreeNode[];
}

export interface RawTreeNode {
  segment: string;
  fullRelativePath: string;
  fullPath: string;
  rootPath?: string;
  source: "auto" | "manual";
  project?: ProjectItem;
  originalIndex?: number;
  children: Map<string, RawTreeNode>;
}

export function convertAndCompactRawNode(raw: RawTreeNode): ProjectTreeNode {
  let curr = raw;
  let combinedSegment = curr.segment;
  let combinedRelPath = curr.fullRelativePath;
  let combinedFullPath = curr.fullPath;

  // Compact chain of single-child directories if curr is not a project
  // and its only child is also not a project
  while (!curr.project && curr.children.size === 1) {
    const onlyChild = Array.from(curr.children.values())[0];
    if (!onlyChild || onlyChild.project) {
      break;
    }
    combinedSegment = combinedSegment
      ? `${combinedSegment}/${onlyChild.segment}`
      : onlyChild.segment;
    combinedRelPath = onlyChild.fullRelativePath;
    combinedFullPath = onlyChild.fullPath;
    curr = onlyChild;
  }

  const convertedChildren = Array.from(curr.children.values()).map((child) =>
    convertAndCompactRawNode(child),
  );

  // Sort children by minOriginalIndex to preserve the active sort order
  convertedChildren.sort((a, b) => a.minOriginalIndex - b.minOriginalIndex);

  let subprojectCount = curr.project ? 1 : 0;
  let totalFileCount = curr.project ? curr.project.fileCount : 0;
  let hasChanges = Boolean(curr.project?.git && !curr.project.git.clean);
  let minOriginalIndex = curr.originalIndex ?? Number.MAX_SAFE_INTEGER;

  for (const child of convertedChildren) {
    subprojectCount += child.subprojectCount;
    totalFileCount += child.totalFileCount;
    if (child.hasChanges) {
      hasChanges = true;
    }
    if (child.minOriginalIndex < minOriginalIndex) {
      minOriginalIndex = child.minOriginalIndex;
    }
  }

  const name = curr.project ? curr.project.name : combinedSegment;

  return {
    name,
    segment: combinedSegment,
    path: combinedFullPath,
    relativePath: combinedRelPath || undefined,
    rootPath: curr.project?.rootPath ?? curr.rootPath,
    source: curr.project?.source ?? curr.source,
    isProject: Boolean(curr.project),
    project: curr.project,
    subprojectCount,
    totalFileCount,
    hasChanges,
    minOriginalIndex,
    children: convertedChildren,
  };
}

export function buildProjectTree(projects: ProjectItem[]): ProjectTreeNode[] {
  if (projects.length === 0) return [];

  // Group by root to keep root trees together
  const rootGroups = new Map<
    string,
    Array<{ project: ProjectItem; originalIndex: number }>
  >();

  for (let idx = 0; idx < projects.length; idx++) {
    const p = projects[idx];
    if (!p) continue;
    let rootKey = "__default__";
    if (p.rootPath) {
      rootKey = normalizePath(p.rootPath);
    } else if (p.source === "manual") {
      rootKey = "__manual__";
    }

    const group = rootGroups.get(rootKey) ?? [];
    group.push({ project: p, originalIndex: idx });
    rootGroups.set(rootKey, group);
  }

  const resultRoots: ProjectTreeNode[] = [];

  for (const [rootKey, groupItems] of rootGroups.entries()) {
    const isManualGroup = rootKey === "__manual__";
    let groupRootPath: string | undefined;
    if (!isManualGroup && rootKey !== "__default__") {
      groupRootPath = rootKey;
    }

    const rawRoot: RawTreeNode = {
      segment: "",
      fullRelativePath: "",
      fullPath: groupRootPath || "",
      rootPath: groupRootPath,
      source: isManualGroup ? "manual" : "auto",
      children: new Map(),
    };

    for (const { project: p, originalIndex } of groupItems) {
      const normPath = normalizePath(p.path);
      let rel = p.relativePath
        ? p.relativePath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")
        : "";

      if (!rel && p.rootPath) {
        const normRoot = normalizePath(p.rootPath);
        if (normPath.startsWith(normRoot)) {
          rel = normPath.slice(normRoot.length).replace(/^\/+|\/+$/g, "");
        }
      }

      let segments: string[];
      if (rel) {
        segments = rel.split("/").filter(Boolean);
      } else {
        segments = [p.name];
      }

      let current = rawRoot;
      let currRel = "";
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (!seg) continue;
        currRel = currRel ? `${currRel}/${seg}` : seg;
        let child = current.children.get(seg);
        if (!child) {
          const childFullPath = groupRootPath
            ? `${groupRootPath}/${currRel}`
            : normPath;
          child = {
            segment: seg,
            fullRelativePath: currRel,
            fullPath: childFullPath,
            rootPath: p.rootPath,
            source: p.source,
            children: new Map(),
          };
          current.children.set(seg, child);
        }
        if (i === segments.length - 1) {
          child.project = p;
          child.originalIndex = originalIndex;
        }
        current = child;
      }
    }

    const treeChildren = Array.from(rawRoot.children.values()).map((rawChild) =>
      convertAndCompactRawNode(rawChild),
    );

    treeChildren.sort((a, b) => a.minOriginalIndex - b.minOriginalIndex);
    resultRoots.push(...treeChildren);
  }

  resultRoots.sort((a, b) => a.minOriginalIndex - b.minOriginalIndex);
  return resultRoots;
}

export interface FlattenedTreeRow {
  node: ProjectTreeNode;
  isLastStack: boolean[];
}

export function flattenTreeToRows(
  nodes: ProjectTreeNode[],
  ancestorIsLastStack: boolean[] = [],
  isTopLevel = true,
): FlattenedTreeRow[] {
  const rows: FlattenedTreeRow[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node) continue;
    const isLastChild = i === nodes.length - 1;
    const rowStack = isTopLevel ? [] : [...ancestorIsLastStack, isLastChild];

    rows.push({
      node,
      isLastStack: rowStack,
    });

    if (node.children.length > 0) {
      const nextAncestorStack = isTopLevel
        ? []
        : [...ancestorIsLastStack, isLastChild];
      rows.push(...flattenTreeToRows(node.children, nextAncestorStack, false));
    }
  }

  return rows;
}

export function getTreePrefix(isLastStack: boolean[]): string {
  if (isLastStack.length === 0) return "";
  let prefix = "";
  for (let i = 0; i < isLastStack.length - 1; i++) {
    prefix += isLastStack[i] ? "    " : "│   ";
  }
  prefix += isLastStack[isLastStack.length - 1] ? "└── " : "├── ";
  return prefix;
}

export function padVisible(
  str: string,
  width: number,
  align: "left" | "right" = "left",
): string {
  const vWidth = visibleWidth(str);
  if (vWidth >= width) {
    return vWidth === width ? str : truncateToWidth(str, width);
  }
  const diff = width - vWidth;
  const padding = " ".repeat(diff);
  return align === "right" ? padding + str : str + padding;
}
