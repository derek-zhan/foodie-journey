import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// Same client-bundling caveat as EXPO_PUBLIC_GOOGLE_PLACES_API_KEY in
// resolvePlace.ts: this key ships inside the app bundle. Fine for a local
// exploratory build, not for anything distributed.
const client = new Anthropic({
  apiKey: process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? "",
  dangerouslyAllowBrowser: true,
});

const JournalEntrySchema = z.object({
  notes: z
    .string()
    .describe(
      "A short first-person diary note about the visit, cleaned up from the raw transcript but keeping the diner's own voice and opinions"
    ),
  tags: z
    .array(z.string())
    .describe(
      "2-5 short lowercase tags for the dish/experience, e.g. 'ramen', 'date night', 'too salty'"
    ),
  rating: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .describe("1-5 star rating, only if the transcript expresses a clear opinion"),
});

export type JournalEntry = z.infer<typeof JournalEntrySchema>;

/**
 * Stage 5: Voice journal structuring
 *
 * Takes a raw speech-to-text transcript for a visit and structures it into
 * diary notes + tags + an optional rating. Speech-to-text capture itself
 * isn't wired up yet (see README) - this takes the transcript text directly.
 */
export async function journalVisit(
  transcript: string,
  placeName: string
): Promise<JournalEntry> {
  // DISABLED — exploratory feature, not yet exercised against a live key.
  // Uncomment the block below (and remove this throw) once you've set
  // EXPO_PUBLIC_ANTHROPIC_API_KEY and are ready to re-enable it.
  throw new Error("journalVisit is disabled — see the comment in journalVisit.ts");

  // if (!process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY) {
  //   throw new Error("Missing EXPO_PUBLIC_ANTHROPIC_API_KEY");
  // }
  //
  // const response = await client.messages.parse({
  //   model: "claude-opus-5",
  //   max_tokens: 1024,
  //   system:
  //     "You turn a spoken diary entry about a restaurant visit into clean, structured notes. Don't invent details that aren't in the transcript.",
  //   messages: [
  //     {
  //       role: "user",
  //       content: `Restaurant: ${placeName}\n\nTranscript: ${transcript}`,
  //     },
  //   ],
  //   output_config: { format: zodOutputFormat(JournalEntrySchema) },
  // });
  //
  // if (!response.parsed_output) {
  //   throw new Error("Claude did not return a parseable journal entry");
  // }
  // return response.parsed_output;
}
