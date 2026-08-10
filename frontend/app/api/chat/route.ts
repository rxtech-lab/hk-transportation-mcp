import {
  streamText,
  generateText,
  generateId,
  Output,
  convertToModelMessages,
  stepCountIs,
  toUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";
import { AI_MODEL } from "@/lib/config";
import { createV6CompatTransform } from "@/lib/ui-stream-compat";
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
    console.log(
      `[chat/POST] chatId=${chatId ?? "none"} messages=${recentMessages.length} capabilities=${JSON.stringify(bodyCapabilities ?? [])}`,
    );
    const modelMessages = await convertToModelMessages(recentMessages);

    const isValidIntent = await isHongKongTransportationQuery(modelMessages);
    if (!isValidIntent) {
      console.warn("[chat/POST] rejected: off-topic query");
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
    console.log(
      `[chat/POST] mcp tools: ${Object.keys(tools).join(", ") || "(none)"}`,
    );

    // Keep the per-key tool types inferred. Annotating this as a Record of a
    // union collapses the three tools into one type, widening inputSchema to
    // FlexibleSchema<unknown>, which no longer satisfies ToolSet.
    const clientTools = {
      display_arrivals: displayArrivalsTool,
      get_user_location: getUserLocationTool,
      ...(hasLiveActivity ? { show_live_activity: showLiveActivityTool } : {}),
    };

    const allTools = { ...tools, ...clientTools };

    const result = streamText({
      model: AI_MODEL,
      tools: allTools,
      messages: modelMessages,
      stopWhen: stepCountIs(20),
      system: `You are an HK bus transportation assistant. Help users find bus routes, nearby stops, and arrival times in Hong Kong.

When the user asks about a specific bus route (e.g., "when is the next 170?" or "is the 960 coming soon?"), use the route_nearby_arrivals tool with their location and the route number. If the user specifies a direction or destination (e.g., "77 to Causeway Bay"), pass the destination name in the "destination" parameter — the tool will geocode it and filter to the correct direction automatically. Use nearby_arrivals only when the user wants to see ALL buses near them without specifying a route.

When querying for minibus (小巴) routes or stops, use "GMB" as the operator.

IMPORTANT: Always call the get_user_location tool to retrieve the user's GPS coordinates BEFORE making any location-based queries (nearby stops, route planning, etc.), UNLESS the user has explicitly provided a specific location or address in their message. Never assume or reuse a previous location — always fetch fresh coordinates via the tool.

IMPORTANT: When mentioning any location, bus stop, or place with known coordinates, you MUST use this special syntax:
📍[Location Name](latitude,longitude)

Examples:
- 📍[田灣商場 Tin Wan Shopping Centre](22.251066,114.149745)
- 📍[中環站 Central Station](22.2819,114.1588)

This syntax will be rendered as an interactive button that shows the location on a map. Always use this format instead of listing coordinates as plain text. You can use it inline within sentences or in lists.

IMPORTANT: After you receive arrival/ETA data from MCP tools (e.g. nearby_arrivals, route_arrivals), you MUST call the display_arrivals tool to present the data as a rich visual card. Pass the "display_query" object from the MCP response as the "query" field in display_arrivals, copying every field it contains (endpoint, lat, lon, radius, routes, dest_lat, dest_lon, radius_origin, radius_dest, max_transfers) exactly as given — do not round, reformat, or omit values. Ignore the "display_url" field; the frontend builds the URL itself. Do NOT pass the stops/arrival data. Include a "title" if appropriate (e.g. "Nearby arrivals" or the route name). When you call display_arrivals, do NOT also include a text table or summary of the same arrival data — the card already shows it visually. Just provide a brief natural language response (e.g. "Here are the upcoming arrivals") alongside the tool call.

If the MCP response does not include a display_query, fall back to extracting stop data manually: extract stop names, coordinates, routes, destinations, and ETA minutes and pass them as "stops". Every stop MUST have an "id" field set to the stop_id from the MCP response for real-time auto-refresh.${hasLiveActivity ? `

After showing arrival data for a specific route, proactively ask the user if they'd like to track the bus on their Lock Screen. If the user agrees, call show_live_activity with the route details including the route number, stop name, stop ID, destination, and current ETAs.` : ""}`,
    });

    const uiStream = toUIMessageStream({
      stream: result.stream,
      tools: allTools,
      onError: (error) => {
        // Detail stays server-side; the client gets the SDK's generic text.
        console.error("[chat/POST] stream error:", error);
        return "An error occurred.";
      },
      onEnd: chatId
        ? () => {
            console.log(`[chat/POST] stream finished chatId=${chatId}`);
            clearActiveStreamId(chatId);
          }
        : undefined,
    });

    return createUIMessageStreamResponse({
      // The mobile app is pinned to AI SDK v6, whose chunk schema rejects
      // v7-only fields (e.g. `toolMetadata`) with an `invalid_union` error.
      stream: uiStream.pipeThrough(createV6CompatTransform()),
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
    console.error("[chat/POST] failed:", error);
    // Reset client on connection errors so next request retries
    resetMCPClient();
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
