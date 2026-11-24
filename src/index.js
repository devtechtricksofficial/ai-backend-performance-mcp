#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { analyzeNPlusOne, formatFindingsSummary } from "./analyze.js";

const server = new McpServer({
  name: "ai-backend-performance-mcp",
  version: "1.0.0",
});

server.registerTool(
  "analyze_n_plus_one",
  {
    title: "Analyze N+1 queries",
    description:
      "Statically scan a Node.js project for likely N+1 database patterns (Prisma and raw SQL in loops).",
    inputSchema: {
      projectPath: z
        .string()
        .optional()
        .describe(
          "Absolute or relative path to the project root. Defaults to the server process working directory.",
        ),
    },
  },
  async ({ projectPath }) => {
    const result = await analyzeNPlusOne(projectPath);
    const summary = formatFindingsSummary(result.findings);
    const payload = {
      projectPath: result.projectPath,
      filesScanned: result.filesScanned,
      findings: result.findings,
    };

    return {
      content: [
        {
          type: "text",
          text: `${summary}\n\n${JSON.stringify(payload, null, 2)}`,
        },
      ],
      structuredContent: payload,
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});