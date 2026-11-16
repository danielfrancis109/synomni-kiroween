/**
 * MCP stdio server for Synomni Chamber memory tools.
 *
 * Run as a standalone process: node cli/mcp.ts
 * Or import { handleSaveMemory, ... } for unit tests.
 *
 * IMPORTANT: imports only src/lib/memory.ts — no Next.js or browser APIs.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  saveNote,
  listNotes,
  retrieveNote,
  searchNotes,
  NoteNotFoundError,
} from "../src/lib/memory.js";

// ---------------------------------------------------------------------------
// Arg schemas (using zod raw shapes for McpServer)
// ---------------------------------------------------------------------------

const SaveMemoryArgs = {
  title: z.string().max(200, "Title exceeds 200 chars"),
  content: z.string().max(10000, "Content exceeds 10 000 chars"),
};

const RetrieveContextArgs = {
  id: z.string(),
  synomniToken: z.string().optional(),
};

const SearchMemoryArgs = {
  query: z.string(),
};

// ---------------------------------------------------------------------------
// Tool handlers (exported for unit testing)
// ---------------------------------------------------------------------------

export type McpContent = { type: "text"; text: string };
export type McpResult = { content: McpContent[] };

export async function handleSaveMemory(args: {
  title: string;
  content: string;
}): Promise<McpResult> {
  const note = await saveNote(args.title, args.content);
  return { content: [{ type: "text", text: JSON.stringify(note) }] };
}

export function handleListNotes(): McpResult {
  const notes = listNotes();
  return { content: [{ type: "text", text: JSON.stringify(notes) }] };
}

export async function handleRetrieveContext(args: {
  id: string;
  synomniToken?: string;
}): Promise<McpResult> {
  let note;
  try {
    note = retrieveNote(args.id);
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: err instanceof Error ? err.message : "Unknown error",
          }),
        },
      ],
    };
  }
  const result: { note: typeof note; synomni?: unknown } = { note };

  if (args.synomniToken) {
    try {
      const response = await fetch(
        "https://synomni.infinitybuilds.download/api/v1/context",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${args.synomniToken}`,
          },
          body: JSON.stringify({ query: note.title }),
          signal: AbortSignal.timeout(10000),
        }
      );
      if (response.ok) {
        result.synomni = await response.json();
      }
    } catch {
      // Graceful degradation — Synomni bridge is optional
    }
  }

  return { content: [{ type: "text", text: JSON.stringify(result) }] };
}

export function handleSearchMemory(args: { query: string }): McpResult {
  const results = searchNotes(args.query);
  return { content: [{ type: "text", text: JSON.stringify(results) }] };
}

// ---------------------------------------------------------------------------
// Server registration
// ---------------------------------------------------------------------------

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "synomni-chamber-memory",
    version: "0.1.0",
  });

  server.tool(
    "save_memory",
    "Save a note to the memory store",
    SaveMemoryArgs,
    async (args) => {
      try {
        return await handleSaveMemory(args);
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: err instanceof Error ? err.message : "Unknown error",
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool("list_notes", "List all notes in the memory store", async () => {
    try {
      return handleListNotes();
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: err instanceof Error ? err.message : "Unknown error",
            }),
          },
        ],
        isError: true,
      };
    }
  });

  server.tool(
    "retrieve_context",
    "Retrieve a note by ID, optionally merging Synomni context",
    RetrieveContextArgs,
    async (args) => {
      try {
        return await handleRetrieveContext(args);
      } catch (err) {
        const isNotFound = err instanceof NoteNotFoundError;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: err instanceof Error ? err.message : "Unknown error",
              }),
            },
          ],
          isError: true,
          ...(isNotFound ? { code: "NOT_FOUND" } : {}),
        };
      }
    }
  );

  server.tool(
    "search_memory",
    "Search notes by keyword",
    SearchMemoryArgs,
    (args) => {
      try {
        return handleSearchMemory(args);
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: err instanceof Error ? err.message : "Unknown error",
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}

// ---------------------------------------------------------------------------
// Bootstrap — only runs when this file is the entry point
// ---------------------------------------------------------------------------

// Detect if running as main (ESM-compatible)
const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("mcp.ts") ||
    process.argv[1].endsWith("mcp.js") ||
    process.argv[1].includes("cli/mcp"));

if (isMain) {
  const mcpServer = createMcpServer();
  const transport = new StdioServerTransport();
  mcpServer.connect(transport).catch((err: unknown) => {
    console.error("MCP server error:", err);
    process.exit(1);
  });
}
