import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { parseSourceFile } from "./scan/parse.js";
import { detectNPlusOneInAst } from "./detect/nplus1.js";
import { walkSourceFiles } from "./scan/walk.js";
import { analyzeNPlusOne } from "./analyze.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "detect", "fixtures");

async function findingsForFixture(name) {
  const filePath = path.join(fixturesDir, name);
  const parsed = await parseSourceFile(filePath);
  assert.ok(parsed, `fixture should parse: ${name}`);
  return detectNPlusOneInAst(filePath, parsed.ast);
}

describe("N+1 detector", () => {
  it("reports high-confidence Prisma pattern in for...of loop", async () => {
    const findings = await findingsForFixture("prisma-nplus1-high.js");
    assert.ok(findings.length >= 1);
    const inner = findings.find((f) => f.message.includes("findMany"));
    assert.ok(inner);
    assert.equal(inner.confidence, "high");
    assert.equal(inner.kind, "prisma");
    assert.match(inner.suggestion, /include|batch/i);
  });

  it("reports raw SQL pool.query inside a loop", async () => {
    const findings = await findingsForFixture("pool-query-nplus1.js");
    assert.ok(findings.length >= 1);
    const hit = findings.find((f) => f.kind === "raw-sql");
    assert.ok(hit);
    assert.match(hit.message, /query/i);
  });

  it("does not flag a single findMany with include outside a loop", async () => {
    const findings = await findingsForFixture("prisma-ok.js");
    assert.equal(findings.length, 0);
  });
});

describe("project walk", () => {
  it("skips node_modules when scanning fixtures parent", async () => {
    const files = await walkSourceFiles(fixturesDir);
    assert.ok(files.every((f) => !f.includes("node_modules")));
    assert.ok(files.some((f) => f.endsWith("prisma-nplus1-high.js")));
  });

  it("analyzeNPlusOne scans fixture directory", async () => {
    const result = await analyzeNPlusOne(fixturesDir);
    assert.ok(result.filesScanned >= 3);
    assert.ok(result.findings.length >= 2);
  });
});