import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// Same client-bundling caveat as EXPO_PUBLIC_GOOGLE_PLACES_API_KEY in
// resolvePlace.ts: this key ships inside the app bundle. Fine for a local
// exploratory build, not for anything distributed.
//
// EXPO_PUBLIC_ANTHROPIC_WORKSPACE_ID is optional and only needed for an
// "identity-linked" API key (one tied to a Console user identity rather
// than scoped directly to a workspace) - the API rejects those with a 400
// ("anthropic-workspace-id is required...") unless this header is sent.
// The SDK's own workspace_id/ANTHROPIC_WORKSPACE_ID handling only applies
// to its auto-detected credential-profile/WIF auth path, not plain apiKey
// construction, so it's sent by hand here instead.
const client = new Anthropic({
  apiKey: process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? "",
  dangerouslyAllowBrowser: true,
  defaultHeaders: process.env.EXPO_PUBLIC_ANTHROPIC_WORKSPACE_ID
    ? { "anthropic-workspace-id": process.env.EXPO_PUBLIC_ANTHROPIC_WORKSPACE_ID }
    : undefined,
});

const JournalEntrySchema = z.object({
  notes: z
    .string()
    .describe(
      "A short first-person journal note about the visit, cleaned up from the raw transcript but keeping the diner's own voice and opinions"
    ),
  tags: z
    .array(z.string())
    .describe(
      "2-5 short lowercase tags covering both the dish/experience and the restaurant's cuisine or type, e.g. 'ramen', 'date night', 'too salty', 'izakaya', 'fast-casual'"
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
 * Takes a raw transcript for a visit and structures it into journal notes +
 * tags + an optional rating. The transcript itself comes from a plain
 * TextInput (JourneyScreen) - voice capture is the OS keyboard's built-in
 * dictation typing into that field, not a speech-to-text call in this
 * pipeline.
 */
export async function journalVisit(
  transcript: string,
  placeName: string
): Promise<JournalEntry> {
  if (!process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY) {
    throw new Error("Missing EXPO_PUBLIC_ANTHROPIC_API_KEY");
  }

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 1024,
    system:
      "You turn a spoken journal entry about a restaurant visit into clean, structured notes. Don't invent details that aren't in the transcript.",
    messages: [
      {
        role: "user",
        content: `Restaurant: ${placeName}\n\nTranscript: ${transcript}`,
      },
    ],
    output_config: { format: zodOutputFormat(JournalEntrySchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Claude did not return a parseable journal entry");
  }
  return response.parsed_output;
}
