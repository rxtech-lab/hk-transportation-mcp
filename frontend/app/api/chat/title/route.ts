import { generateText } from "ai";
import { AI_MODEL } from "@/lib/config";

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    const snippet = (messages ?? [])
      .slice(0, 4)
      .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
      .join("\n");

    const { text } = await generateText({
      model: AI_MODEL,
      system:
        "Generate a short title (max 6 words) for this conversation about Hong Kong transportation. Return only the title text, no quotes.",
      prompt: snippet,
    });

    return Response.json({ title: text.trim() });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate title";
    return Response.json({ error: message }, { status: 500 });
  }
}
