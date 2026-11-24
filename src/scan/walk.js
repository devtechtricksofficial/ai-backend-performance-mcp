import fs from "node:fs/promises";
import path from "node:path";

const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx"]);

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".git",
]);

/** Skip generated Prisma client output under node_modules is already excluded. */
function shouldSkipDir(dirName) {
  return SKIP_DIR_NAMES.has(dirName);
}

function isSourceFile(fileName) {
  return SOURCE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

/**
 * @param {string} rootDir Absolute project root
 * @returns {Promise<string[]>} Absolute paths to source files
 */
export async function walkSourceFiles(rootDir) {
  const resolvedRoot = path.resolve(rootDir);
  const files = [];

  async function walk(currentDir) {
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name)) {
          continue;
        }
        await walk(fullPath);
        continue;
      }

      if (entry.isFile() && isSourceFile(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  await walk(resolvedRoot);
  return files.sort();
}