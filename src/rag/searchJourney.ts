import Anthropic from "@anthropic-ai/sdk";
import { searchVisits } from "../db/visitStore";
import type { Visit } from "../types";

// Same client-bundling caveat as journalVisit.ts / resolvePlace.ts, and the
// same EXPO_PUBLIC_ANTHROPIC_WORKSPACE_ID requirement for identity-linked
// keys - see the comment on the client in journalVisit.ts.
const client = new Anthropic({
  apiKey: process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? "",
  dangerouslyAllowBrowser: true,
  defaultHeaders: process.env.EXPO_PUBLIC_ANTHROPIC_WORKSPACE_ID
    ? { "anthropic-workspace-id": process.env.EXPO_PUBLIC_ANTHROPIC_WORKSPACE_ID }
    : undefined,
});

export interface JourneyAnswer {
  answer: string;
  sources: Visit[];
}

/**
 * Retrieval step: local full-text search (SQLite FTS5 + bm25, see
 * db/visitStore.ts) over journaled visits - no embeddings, no external
 * API. Visits without a journal entry yet have no notes/tags to search
 * and are never returned.
 */
export function findRelevantVisits(query: string): Visit[] {
  return searchVisits(query);
}

/**
 * RAG over the journey: retrieves the most relevant journaled visits for a
 * natural-language query via local full-text search, then has Claude
 * answer using only those visits as context (so it can't invent visits
 * that aren't in the journey).
 */
export async function askJourney(query: string): Promise<JourneyAnswer> {
  const sources = findRelevantVisits(query);
  if (sources.length === 0) {
    return {
      answer:
        "No journaled visits yet to search - add a journal entry to a visit first.",
      sources: [],
    };
  }

  const context = sources
    .map((v, i) => {
      const date = new Date(v.startedAt).toLocaleDateString();
      const rating = v.rating ? ` - ${v.rating}/5` : "";
      const tags = v.tags?.length ? ` - tags: ${v.tags.join(", ")}` : "";
      const notes = v.notes ? `\n${v.notes}` : "";
      return `[${i + 1}] ${v.place.name} - ${date}${rating}${tags}${notes}`;
    })
    .join("\n\n");

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 1024,
    system:
      "You answer questions about the user's restaurant journey using only the visits given as context. Cite visits by their [n] number. If the context doesn't answer the question, say so plainly.",
    messages: [
      {
        role: "user",
        content: `Visits:\n${context}\n\nQuestion: ${query}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return {
    answer: textBlock?.type === "text" ? textBlock.text : "",
    sources,
  };
}
