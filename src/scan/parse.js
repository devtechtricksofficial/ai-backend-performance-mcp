import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "@babel/parser";

const EXT_PLUGINS = {
  ".ts": ["typescript"],
  ".tsx": ["typescript", "jsx"],
  ".jsx": ["jsx"],
};

/**
 * @param {string} filePath
 * @returns {Promise<{ ast: import('@babel/types').File; code: string } | null>}
 */
export async function parseSourceFile(filePath) {
  let code;
  try {
    code = await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }

  const ext = path.extname(filePath).toLowerCase();
  const extraPlugins = EXT_PLUGINS[ext] ?? [];
  const plugins = [
    "jsx",
    "typescript",
    "classProperties",
    "decorators-legacy",
    "dynamicImport",
    "importMeta",
    "topLevelAwait",
    ...extraPlugins,
  ];

  try {
    const ast = parse(code, {
      sourceType: "module",
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      plugins: [...new Set(plugins)],
      errorRecovery: true,
    });
    return { ast, code };
  } catch {
    try {
      const ast = parse(code, {
        sourceType: "script",
        allowReturnOutsideFunction: true,
        plugins: [...new Set(plugins)],
        errorRecovery: true,
      });
      return { ast, code };
    } catch {
      return null;
    }
  }
}