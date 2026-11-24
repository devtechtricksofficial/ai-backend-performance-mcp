# AI Backend Performance MCP

An intelligent code analysis MCP server designed to help Node.js developers identify backend performance bottlenecks before they reach production.

### Features

- Detect potential N+1 database query patterns (v1: `analyze_n_plus_one` tool).
- Identify inefficient async operations (planned).
- Analyze database connection pooling practices (planned).
- Identify dependency and package hygiene issues (planned).
- Provide actionable backend performance recommendations.

### Tech Stack

- Node.js 20+
- JavaScript (ES modules)
- Model Context Protocol (MCP)
- Static code analysis (`@babel/parser`)

### Goal

Help developers write faster, more scalable, and production-ready Node.js applications.

## Setup

```bash
npm install
npm test
```

Run the MCP server locally (stdio):

```bash
npm start
```

The server communicates over stdin/stdout. Do not print logs to stdout; errors go to stderr.

## Cursor configuration

After publishing to npm, use `npx` (no local clone required):

```json
{
  "mcpServers": {
    "ai-backend-performance": {
      "command": "npx",
      "args": ["-y", "ai-backend-performance-mcp"]
    }
  }
}
```

For local development, point at this repo:

| Field | Value |
| --- | --- |
| Command | `node` |
| Args | Absolute path to `src/index.js` |
| cwd | Optional: default project to scan when `projectPath` is omitted |

### Tool: `analyze_n_plus_one`

| Input | Description |
| --- | --- |
| `projectPath` (optional) | Root directory to scan. Defaults to the server process working directory. |

The tool walks `.js`, `.mjs`, `.cjs`, `.ts`, and `.tsx` files, skips `node_modules`, `dist`, `build`, and `coverage`, and reports likely Prisma or raw-SQL queries inside loops.

Findings include file, line, confidence (`high` / `medium`), kind (`prisma` / `raw-sql`), message, and suggestion text.