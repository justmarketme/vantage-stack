#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ResearchJson } from "./schema";
import { generateHealthScore } from "./scoring";
import { calculateRevenueOpportunity, frameUpsells, identifyGaps } from "./analysis";
import { createMarkdownReport } from "./report";

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asResearchJson(v: unknown): ResearchJson {
  // We accept partial/unknown shapes; the downstream functions handle missing fields conservatively.
  return (asObject(v) ?? {}) as ResearchJson;
}

const server = new Server(
  { name: "report-builder", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

const ResearchInput = z.object({ research: z.record(z.any()) });
const FrameUpsellsInput = z.object({
  research: z.record(z.any()),
  gaps: z.array(z.record(z.any())).default([]),
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "generate-health-score",
        description: "Compute a 0–100 website health score from traffic, speed, and backlinks.",
        inputSchema: zodToJsonSchema(ResearchInput),
      },
      {
        name: "identify-gaps",
        description: "Identify competitive gaps (traffic/speed/authority/keywords/conversion) from research JSON.",
        inputSchema: zodToJsonSchema(ResearchInput),
      },
      {
        name: "calculate-revenue-opportunity",
        description:
          "Estimate paid growth revenue opportunity using CPC benchmarks and current traffic (conservative defaults when missing).",
        inputSchema: zodToJsonSchema(ResearchInput),
      },
      {
        name: "frame-upsells",
        description:
          "Turn identified gaps into logical next-step offers (upsells) framed as scoped outcomes, not hard sells.",
        inputSchema: zodToJsonSchema(FrameUpsellsInput),
      },
      {
        name: "create-markdown-report",
        description:
          "Generate a business-ready markdown report with embedded JSON data blocks for video generation.",
        inputSchema: zodToJsonSchema(ResearchInput),
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params ?? {};
  const obj = asObject(args) ?? {};

  if (name === "generate-health-score") {
    const parsed = ResearchInput.parse(obj);
    const research = asResearchJson(parsed.research);
    const score = generateHealthScore(research);
    return { content: [{ type: "text", text: JSON.stringify(score, null, 2) }] };
  }

  if (name === "identify-gaps") {
    const parsed = ResearchInput.parse(obj);
    const research = asResearchJson(parsed.research);
    const gaps = identifyGaps(research);
    return { content: [{ type: "text", text: JSON.stringify(gaps, null, 2) }] };
  }

  if (name === "calculate-revenue-opportunity") {
    const parsed = ResearchInput.parse(obj);
    const research = asResearchJson(parsed.research);
    const revenue = calculateRevenueOpportunity(research);
    return { content: [{ type: "text", text: JSON.stringify(revenue, null, 2) }] };
  }

  if (name === "frame-upsells") {
    const parsed = FrameUpsellsInput.parse(obj);
    const research = asResearchJson(parsed.research);
    const upsells = frameUpsells(research, parsed.gaps as any);
    return { content: [{ type: "text", text: JSON.stringify(upsells, null, 2) }] };
  }

  if (name === "create-markdown-report") {
    const parsed = ResearchInput.parse(obj);
    const research = asResearchJson(parsed.research);
    const health = generateHealthScore(research);
    const gaps = identifyGaps(research);
    const revenue = calculateRevenueOpportunity(research);
    const upsells = frameUpsells(research, gaps);
    const md = createMarkdownReport({ research, health, gaps, revenue, upsells });
    return { content: [{ type: "text", text: md }] };
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

