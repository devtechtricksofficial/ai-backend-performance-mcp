import path from "node:path";
import { walkSourceFiles } from "./scan/walk.js";
import { parseSourceFile } from "./scan/parse.js";
import { detectNPlusOneInAst } from "./detect/nplus1.js";

/**
 * @param {string} [projectPath]
 */
export async function analyzeNPlusOne(projectPath) {
  const root = path.resolve(projectPath ?? process.cwd());
  const files = await walkSourceFiles(root);
  /** @type {import('./detect/nplus1.js').Finding[]} */
  const findings = [];

  for (const file of files) {
    const parsed = await parseSourceFile(file);
    if (!parsed) {
      continue;
    }
    findings.push(...detectNPlusOneInAst(file, parsed.ast));
  }

  return {
    projectPath: root,
    filesScanned: files.length,
    findings,
  };
}

/**
 * @param {import('./detect/nplus1.js').Finding[]} findings
 */
export function formatFindingsSummary(findings) {
  if (findings.length === 0) {
    return "No likely N+1 query patterns found.";
  }

  const high = findings.filter((f) => f.confidence === "high").length;
  const medium = findings.length - high;

  const lines = [
    `Found ${findings.length} possible N+1 pattern(s) (${high} high, ${medium} medium confidence).`,
    "",
    ...findings.map(
      (f) =>
        `[${f.confidence}] ${f.file}:${f.line} — ${f.message}\n  → ${f.suggestion}`,
    ),
  ];

  return lines.join("\n");
}