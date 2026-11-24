import traverseModule from "@babel/traverse";

const traverse = traverseModule.default ?? traverseModule;
import * as t from "@babel/types";

const PRISMA_METHODS = new Set([
  "findMany",
  "findUnique",
  "findFirst",
  "findUniqueOrThrow",
  "findFirstOrThrow",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
  "$queryRaw",
  "$executeRaw",
  "$queryRawUnsafe",
  "$executeRawUnsafe",
]);

const ARRAY_CALLBACKS = new Set(["map", "forEach", "flatMap", "filter", "reduce"]);

const SQL_METHODS = new Set(["query", "execute", "raw"]);

const SQL_KEYWORD = /\b(SELECT|INSERT|UPDATE|DELETE)\b/i;

const LOOP_TYPES = new Set([
  "ForStatement",
  "ForOfStatement",
  "ForInStatement",
  "WhileStatement",
  "DoWhileStatement",
]);

/**
 * @typedef {{
 *   file: string;
 *   line: number;
 *   confidence: "high" | "medium";
 *   kind: "prisma" | "raw-sql";
 *   message: string;
 *   suggestion: string;
 * }} Finding
 */

/**
 * @param {import('@babel/types').Node | null | undefined} node
 * @returns {string[]}
 */
function bindingNamesFromPattern(node) {
  if (!node) {
    return [];
  }
  if (t.isIdentifier(node)) {
    return [node.name];
  }
  if (t.isAssignmentPattern(node) && t.isIdentifier(node.left)) {
    return [node.left.name];
  }
  if (t.isObjectPattern(node)) {
    return node.properties.flatMap((prop) =>
      bindingNamesFromPattern(/** @type {import('@babel/types').Node} */ (prop)),
    );
  }
  if (t.isArrayPattern(node)) {
    return node.elements
      .filter(Boolean)
      .flatMap((el) =>
        bindingNamesFromPattern(/** @type {import('@babel/types').Node} */ (el)),
      );
  }
  if (t.isRestElement(node)) {
    return bindingNamesFromPattern(node.argument);
  }
  if (t.isObjectProperty(node)) {
    return bindingNamesFromPattern(node.value);
  }
  return [];
}

/**
 * @param {import('@babel/types').MemberExpression | import('@babel/types').OptionalMemberExpression} member
 */
function memberPropertyName(member) {
  if (t.isIdentifier(member.property) && !member.computed) {
    return member.property.name;
  }
  if (t.isStringLiteral(member.property)) {
    return member.property.value;
  }
  return null;
}

/**
 * @param {import('@babel/types').CallExpression | import('@babel/types').OptionalCallExpression} call
 * @returns {{ kind: "prisma" | "raw-sql"; method: string } | null}
 */
function classifyDbCall(call) {
  const callee = call.callee;
  if (!t.isMemberExpression(callee) && !t.isOptionalMemberExpression(callee)) {
    return null;
  }

  const method = memberPropertyName(callee);
  if (!method) {
    return null;
  }

  if (PRISMA_METHODS.has(method)) {
    return { kind: "prisma", method };
  }

  if (SQL_METHODS.has(method) && callContainsSql(call)) {
    return { kind: "raw-sql", method };
  }

  return null;
}

/**
 * @param {import('@babel/types').Node} node
 */
function nodeContainsSqlText(node) {
  if (t.isStringLiteral(node)) {
    return SQL_KEYWORD.test(node.value);
  }
  if (t.isTemplateLiteral(node)) {
    const raw = node.quasis.map((q) => q.value.raw).join(" ");
    return SQL_KEYWORD.test(raw);
  }
  if (t.isBinaryExpression(node) && node.operator === "+") {
    return nodeContainsSqlText(node.left) || nodeContainsSqlText(node.right);
  }
  return false;
}

/**
 * @param {import('@babel/types').CallExpression | import('@babel/types').OptionalCallExpression} call
 */
function callContainsSql(call) {
  return call.arguments.some((arg) => nodeContainsSqlText(arg));
}

/**
 * @param {import('@babel/types').CallExpression} call
 */
function isListPrismaQuery(call) {
  const classified = classifyDbCall(call);
  return classified?.kind === "prisma" && classified.method === "findMany";
}

/**
 * @param {import('@babel/types').Node} root
 * @param {Set<string>} allowedNames
 */
function subtreeUsesAnyIdentifier(root, allowedNames) {
  let found = false;
  traverse(/** @type {import('@babel/types').Node} */ (root), {
    noScope: true,
    Identifier(p) {
      if (p.node.name && allowedNames.has(p.node.name)) {
        if (!p.isReferencedIdentifier()) {
          return;
        }
        found = true;
        p.stop();
      }
    },
  });
  return found;
}

/**
 * @param {import('@babel/traverse').NodePath} callPath
 */
function getActiveLoopContext(callPath) {
  /** @type {{ type: string; bindings: string[] } | null} */
  let result = null;

  let current = callPath.parentPath;
  while (current) {
    const node = current.node;
    if (!node) {
      break;
    }

    if (LOOP_TYPES.has(node.type)) {
      const bindings = loopBindingsForNode(node);
      result = { type: node.type, bindings };
      break;
    }

    if (
      t.isCallExpression(node) &&
      t.isMemberExpression(node.callee) &&
      t.isIdentifier(node.callee.property) &&
      ARRAY_CALLBACKS.has(node.callee.property.name) &&
      node.arguments[0] &&
      t.isFunction(node.arguments[0])
    ) {
      const fn = node.arguments[0];
      const bindings = fn.params.flatMap((param) => bindingNamesFromPattern(param));
      result = { type: "ArrayCallback", bindings };
      break;
    }

    if (t.isFunction(node)) {
      break;
    }

    current = current.parentPath;
  }

  return result;
}

/**
 * @param {import('@babel/types').Node} node
 */
function loopBindingsForNode(node) {
  if (t.isForOfStatement(node) || t.isForInStatement(node)) {
    if (t.isVariableDeclaration(node.left)) {
      return node.left.declarations.flatMap((d) => bindingNamesFromPattern(d.id));
    }
    return bindingNamesFromPattern(node.left);
  }
  if (t.isForStatement(node) && t.isVariableDeclaration(node.init)) {
    return node.init.declarations.flatMap((d) => bindingNamesFromPattern(d.id));
  }
  return [];
}

/**
 * @param {import('@babel/traverse').NodePath} callPath
 */
function functionPathHasPriorListQuery(callPath) {
  const fnPath = callPath.getFunctionParent();
  if (!fnPath?.node) {
    return false;
  }

  const callStart = callPath.node.start ?? 0;
  let found = false;

  fnPath.traverse({
    CallExpression(innerPath) {
      if (innerPath.node === callPath.node) {
        return;
      }
      const start = innerPath.node.start ?? 0;
      if (start >= callStart) {
        return;
      }
      if (isListPrismaQuery(innerPath.node)) {
        found = true;
        innerPath.stop();
      }
    },
  });

  return found;
}

/**
 * @param {string} filePath
 * @param {import('@babel/types').File} ast
 * @returns {Finding[]}
 */
export function detectNPlusOneInAst(filePath, ast) {
  /** @type {Finding[]} */
  const findings = [];

  traverse(ast, {
    CallExpression(callPath) {
      const classified = classifyDbCall(callPath.node);
      if (!classified) {
        return;
      }

      const loopContext = getActiveLoopContext(callPath);
      if (!loopContext) {
        return;
      }

      const line = callPath.node.loc?.start.line ?? 1;
      const bindingSet = new Set(loopContext.bindings);
      const usesLoopVar =
        bindingSet.size > 0 && subtreeUsesAnyIdentifier(callPath.node, bindingSet);
      const priorList = functionPathHasPriorListQuery(callPath);

      const confidence =
        priorList && usesLoopVar ? "high" : "medium";

      const suggestion =
        classified.kind === "prisma"
          ? confidence === "high"
            ? "Use Prisma include/select on the initial findMany, or batch IDs with findMany({ where: { id: { in: ids } } })."
            : "Avoid per-iteration Prisma queries; prefer eager loading (include/select) or batched where-in queries."
          : confidence === "high"
            ? "Batch rows into one query (e.g. WHERE id = ANY($1) or IN (...)) instead of querying inside the loop."
            : "Move SQL out of the loop: use a single query with JOIN or an IN/ANY clause.";

      const message =
        classified.kind === "prisma"
          ? `Prisma ${classified.method}() inside a loop may cause N+1 queries.`
          : `${classified.method}() with SQL inside a loop may cause N+1 queries.`;

      findings.push({
        file: filePath,
        line,
        confidence,
        kind: classified.kind,
        message,
        suggestion,
      });
    },
  });

  return findings;
}
