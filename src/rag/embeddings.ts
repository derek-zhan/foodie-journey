// Claude has no embeddings endpoint, so semantic search over the diary uses
// Voyage AI (Anthropic's recommended embedding partner) instead.
const VOYAGE_API_KEY = process.env.EXPO_PUBLIC_VOYAGE_API_KEY ?? "";
export const EMBEDDING_MODEL = "voyage-3.5";

/**
 * Embeds a piece of text via the Voyage AI embeddings API. Voyage's models
 * are asymmetric - embed diary entries as "document" and search queries as
 * "query" for better retrieval quality.
 */
export async function embedText(
  text: string,
  inputType: "query" | "document"
): Promise<number[]> {
  // DISABLED — exploratory feature, not yet exercised against a live key.
  // Uncomment the block below (and remove this throw) once you've set
  // EXPO_PUBLIC_VOYAGE_API_KEY and are ready to re-enable it.
  throw new Error("embedText is disabled — see the comment in embeddings.ts");

  // if (!VOYAGE_API_KEY) {
  //   throw new Error("Missing EXPO_PUBLIC_VOYAGE_API_KEY");
  // }
  //
  // const response = await fetch("https://api.voyageai.com/v1/embeddings", {
  //   method: "POST",
  //   headers: {
  //     "Content-Type": "application/json",
  //     Authorization: `Bearer ${VOYAGE_API_KEY}`,
  //   },
  //   body: JSON.stringify({
  //     input: [text],
  //     model: EMBEDDING_MODEL,
  //     input_type: inputType,
  //   }),
  // });
  //
  // if (!response.ok) {
  //   throw new Error(`Voyage embeddings error: ${response.status}`);
  // }
  //
  // const data = await response.json();
  // return data.data[0].embedding;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
