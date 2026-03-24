import {
  streamText,
  generateText,
  generateId,
  Output,
  convertToModelMessages,
  stepCountIs,
} from "ai";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";
import { AI_MODEL } from "@/lib/config";
import { getMCPClient, resetMCPClient } from "@/lib/mcp-client";
import { displayArrivalsTool } from "@/lib/tools/display-arrivals";
import { getUserLocationTool } from "@/lib/tools/get-user-location";
import { showLiveActivityTool } from "@/lib/tools/show-live-activity";
import { checkRateLimit } from "@/lib/ratelimit";
import {
  setActiveStreamId,
  clearActiveStreamId,
} from "@/lib/chat-store";

const streamContext = createResumableStreamContext({
  waitUntil: after,
});

async function isHongKongTransportationQuery(
  modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>,
): Promise<boolean> {
  const { output: classification } = await generateText({
    model: AI_MODEL,
    output: Output.choice({ options: ["YES", "NO"] }),
    messages: modelMessages,
    system: `You are a strict classifier for a Hong Kong transportation app.

Determine whether the user's message is related to transportation or could reasonably be a transportation query in the context of this app.
Return exactly one word: YES or NO.

Return YES for:
- Any mention of buses, routes, stops, arrivals, fares, directions, MTR, ferries, trams, minibuses, transit planning
- Generic transportation queries like "buses near me", "nearby stops", "how do I get to X"
- Greetings or follow-up messages in a conversation (e.g. "hello", "thanks", "yes")
Return NO only for clearly unrelated topics (e.g. cooking recipes, stock prices, coding help).`,
  });

  return classification === "YES";
}

export async function POST(req: Request) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
    const { success } = await checkRateLimit(ip);
    if (!success) {
      return Response.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 },
      );
    }

    const body = await req.json();
    const { messages, id: chatId, capabilities: bodyCapabilities } = body;

    const recentMessages = Array.isArray(messages) ? messages.slice(-20) : [];
    const modelMessages = await convertToModelMessages(recentMessages);

    const isValidIntent = await isHongKongTransportationQuery(modelMessages);
    if (!isValidIntent) {
      return Response.json(
        {
          error:
            "This assistant only supports Hong Kong transportation queries.",
        },
        { status: 400 },
      );
    }

    const queryCapabilities = new URL(req.url).searchParams.getAll("capabilities");
    const allCapabilities = [
      ...queryCapabilities,
      ...(Array.isArray(bodyCapabilities) ? bodyCapabilities : []),
    ];
    const hasLiveActivity = allCapabilities.includes("liveActivity");

    const mcpClient = await getMCPClient();
    const tools = await mcpClient.tools();

    const clientTools: Record<string, typeof displayArrivalsTool | typeof getUserLocationTool | typeof showLiveActivityTool> = {
      display_arrivals: displayArrivalsTool,
      get_user_location: getUserLocationTool,
    };
    if (hasLiveActivity) {
      clientTools.show_live_activity = showLiveActivityTool;
    }

    const result = streamText({
      model: AI_MODEL,
      tools: { ...tools, ...clientTools },
      messages: modelMessages,
      stopWhen: stepCountIs(20),
      system: `You are an HK bus transportation assistant. Help users find bus routes, nearby stops, and arrival times in Hong Kong.

When querying for minibus (小巴) routes or stops, use "GMB" as the operator.

IMPORTANT: Always call the get_user_location tool to retrieve the user's GPS coordinates BEFORE making any location-based queries (nearby stops, route planning, etc.), UNLESS the user has explicitly provided a specific location or address in their message. Never assume or reuse a previous location — always fetch fresh coordinates via the tool.

IMPORTANT: When mentioning any location, bus stop, or place with known coordinates, you MUST use this special syntax:
📍[Location Name](latitude,longitude)

Examples:
- 📍[田灣商場 Tin Wan Shopping Centre](22.251066,114.149745)
- 📍[中環站 Central Station](22.2819,114.1588)

This syntax will be rendered as an interactive button that shows the location on a map. Always use this format instead of listing coordinates as plain text. You can use it inline within sentences or in lists.

IMPORTANT: After you receive arrival/ETA data from MCP tools (e.g. nearby_arrivals, route_arrivals), you MUST call the display_arrivals tool to present the data as a rich visual card. Pass the "display_url" value from the MCP response as the "url" field in display_arrivals. Do NOT pass the stops/arrival data — the frontend fetches it directly from the URL. Include a "title" if appropriate (e.g. "Nearby arrivals" or the route name). When you call display_arrivals, do NOT also include a text table or summary of the same arrival data — the card already shows it visually. Just provide a brief natural language response (e.g. "Here are the upcoming arrivals") alongside the tool call.

If the MCP response does not include a display_url, fall back to extracting stop data manually: extract stop names, coordinates, routes, destinations, and ETA minutes and pass them as "stops". Every stop MUST have an "id" field set to the stop_id from the MCP response for real-time auto-refresh.${hasLiveActivity ? `

After showing arrival data for a specific route, proactively ask the user if they'd like to track the bus on their Lock Screen. If the user agrees, call show_live_activity with the route details including the route number, stop name, stop ID, destination, and current ETAs.` : ""}`,
    });

    return result.toUIMessageStreamResponse({
      onFinish: chatId
        ? () => {
            clearActiveStreamId(chatId);
          }
        : undefined,
      consumeSseStream: chatId
        ? async ({ stream }) => {
            const streamId = generateId();
            await streamContext.createNewResumableStream(
              streamId,
              () => stream,
            );
            await setActiveStreamId(chatId, streamId);
          }
        : undefined,
    });
  } catch (error) {
    // Reset client on connection errors so next request retries
    resetMCPClient();
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
