import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitInfo } from "./types.js";

const execFileAsync = promisify(execFile);

export function getFastGitBranchFallback(gitDir: string): string | undefined {
  try {
    const headFile = join(gitDir, "HEAD");
    if (existsSync(headFile)) {
      const content = readFileSync(headFile, "utf8").trim();
      if (content.startsWith("ref: refs/heads/")) {
        return content.slice("ref: refs/heads/".length);
      }
      return content.slice(0, 7); // detached commit sha
    }
  } catch {
    // Non-fatal
  }
  return undefined;
}

export async function readGitInfo(projectPath: string): Promise<GitInfo | null> {
  const gitDir = join(projectPath, ".git");
  if (!existsSync(gitDir)) {
    return null;
  }

  let branch: string | undefined = getFastGitBranchFallback(gitDir) || "HEAD";
  let aheadCount = 0;
  let behindCount = 0;
  let modifiedCount = 0;
  let stagedCount = 0;
  let untrackedCount = 0;

  try {
    const { stdout } = await execFileAsync(
      "git",
      ["status", "--porcelain=v1", "--branch"],
      {
        cwd: projectPath,
        timeout: 2000,
        maxBuffer: 1024 * 1024,
      },
    );

    const lines = stdout.split(/\r?\n/).filter(Boolean);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (i === 0 && line.startsWith("##")) {
        // Branch header line: ## main...origin/main [ahead 1, behind 2]
        const branchPart = line.slice(2).trim();
        const mainBranchMatch = branchPart.match(/^([^\s.]+)/);
        if (mainBranchMatch && mainBranchMatch[1] && mainBranchMatch[1] !== "No") {
          branch = mainBranchMatch[1];
        }

        const aheadMatch = branchPart.match(/ahead (\d+)/);
        if (aheadMatch && aheadMatch[1]) {
          aheadCount = parseInt(aheadMatch[1], 10);
        }

        const behindMatch = branchPart.match(/behind (\d+)/);
        if (behindMatch && behindMatch[1]) {
          behindCount = parseInt(behindMatch[1], 10);
        }
      } else if (line.length >= 2) {
        const x = line[0];
        const y = line[1];

        if (x === "?" && y === "?") {
          untrackedCount++;
        } else {
          if (x && x !== " " && x !== "?") {
            stagedCount++;
          }
          if (y && y !== " " && y !== "?") {
            modifiedCount++;
          }
        }
      }
    }
  } catch {
    // If git command fails, fallback to basic branch info
  }

  const isClean =
    modifiedCount === 0 &&
    stagedCount === 0 &&
    untrackedCount === 0 &&
    aheadCount === 0 &&
    behindCount === 0;

  // Determine appropriate status emoji
  let statusEmoji = "✨"; // Clean
  if (aheadCount > 0 && behindCount > 0) {
    statusEmoji = "⚡"; // Diverged
  } else if (aheadCount > 0) {
    statusEmoji = "🚀"; // Ahead (unpushed)
  } else if (behindCount > 0) {
    statusEmoji = "📥"; // Behind remote
  } else if (stagedCount > 0) {
    statusEmoji = "➕"; // Staged
  } else if (modifiedCount > 0) {
    statusEmoji = "📝"; // Modified
  } else if (untrackedCount > 0) {
    statusEmoji = "❓"; // Untracked
  }

  // Summary badge string (e.g. "main ✨", "main 📝 +2", "main 🚀+1")
  const parts: string[] = [];
  if (branch) parts.push(branch);
  parts.push(statusEmoji);

  const changes: string[] = [];
  if (stagedCount > 0) changes.push(`+${stagedCount}`);
  if (modifiedCount > 0) changes.push(`~${modifiedCount}`);
  if (untrackedCount > 0) changes.push(`?${untrackedCount}`);
  if (aheadCount > 0) changes.push(`↑${aheadCount}`);
  if (behindCount > 0) changes.push(`↓${behindCount}`);

  if (changes.length > 0) {
    parts.push(changes.join(" "));
  }

  return {
    isGit: true,
    branch,
    clean: isClean,
    statusEmoji,
    modifiedCount,
    stagedCount,
    untrackedCount,
    aheadCount,
    behindCount,
    statusSummary: parts.join(" "),
  };
}
