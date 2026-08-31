import Anthropic from "@anthropic-ai/sdk";
import { listVisitEmbeddings } from "../db/embeddingStore";
import { listVisits } from "../db/visitStore";
import type { Visit } from "../types";
import { cosineSimilarity, embedText } from "./embeddings";

// Same client-bundling caveat as journalVisit.ts / resolvePlace.ts.
const client = new Anthropic({
  apiKey: process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? "",
  dangerouslyAllowBrowser: true,
});

const TOP_K = 5;

export interface DiaryAnswer {
  answer: string;
  sources: Visit[];
}

/**
 * Retrieval step: embeds the query and ranks journaled visits by cosine
 * similarity against their stored embeddings. Visits without a journal
 * entry yet have no embedding and are never returned.
 */
export async function findRelevantVisits(query: string): Promise<Visit[]> {
  const embeddings = listVisitEmbeddings();
  if (embeddings.length === 0) return [];

  const queryEmbedding = await embedText(query, "query");
  const visitById = new Map(listVisits().map((v) => [v.id, v]));

  return embeddings
    .map(({ visitId, embedding }) => ({
      visit: visitById.get(visitId),
      score: cosineSimilarity(queryEmbedding, embedding),
    }))
    .filter((r): r is { visit: Visit; score: number } => r.visit != null)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K)
    .map((r) => r.visit);
}

/**
 * RAG over the diary: retrieves the most relevant journaled visits for a
 * natural-language query, then has Claude answer using only those visits
 * as context (so it can't invent visits that aren't in the diary).
 */
export async function askDiary(query: string): Promise<DiaryAnswer> {
  const sources = await findRelevantVisits(query);
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

  // DISABLED — exploratory feature, not yet exercised against a live key.
  // Uncomment the block below (and remove this throw) once you've set
  // EXPO_PUBLIC_ANTHROPIC_API_KEY and are ready to re-enable it.
  throw new Error("askDiary is disabled — see the comment in searchDiary.ts");

  // const response = await client.messages.create({
  //   model: "claude-opus-5",
  //   max_tokens: 1024,
  //   system:
  //     "You answer questions about the user's restaurant diary using only the visits given as context. Cite visits by their [n] number. If the context doesn't answer the question, say so plainly.",
  //   messages: [
  //     {
  //       role: "user",
  //       content: `Diary visits:\n${context}\n\nQuestion: ${query}`,
  //     },
  //   ],
  // });
  //
  // const textBlock = response.content.find((b) => b.type === "text");
  // return {
  //   answer: textBlock?.type === "text" ? textBlock.text : "",
  //   sources,
  // };
}
