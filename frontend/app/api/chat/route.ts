import {
  streamText,
  generateText,
  Output,
  convertToModelMessages,
  stepCountIs,
} from "ai";
import { AI_MODEL } from "@/lib/config";
import { getMCPClient, resetMCPClient } from "@/lib/mcp-client";
import { displayArrivalsTool } from "@/lib/tools/display-arrivals";
import { getUserLocationTool } from "@/lib/tools/get-user-location";

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
    const body = await req.json();
    console.log("[chat/route] request body keys:", Object.keys(body));
    console.log(
      "[chat/route] messages type:",
      typeof body.messages,
      "isArray:",
      Array.isArray(body.messages),
      "length:",
      body.messages?.length,
    );
    console.log("[chat/route] full body:", JSON.stringify(body).slice(0, 500));
    const { messages } = body;

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

    const mcpClient = await getMCPClient();
    const tools = await mcpClient.tools();

    const result = streamText({
      model: AI_MODEL,
      tools: { ...tools, display_arrivals: displayArrivalsTool, get_user_location: getUserLocationTool },
      messages: modelMessages,
      stopWhen: stepCountIs(20),
      system: `You are an HK bus transportation assistant. Help users find bus routes, nearby stops, and arrival times in Hong Kong.

When you need the user's location (e.g. for nearby stops or location-based queries), call the get_user_location tool to retrieve their GPS coordinates. Do not assume the user's location — always request it via the tool when needed.

IMPORTANT: When mentioning any location, bus stop, or place with known coordinates, you MUST use this special syntax:
📍[Location Name](latitude,longitude)

Examples:
- 📍[田灣商場 Tin Wan Shopping Centre](22.251066,114.149745)
- 📍[中環站 Central Station](22.2819,114.1588)

This syntax will be rendered as an interactive button that shows the location on a map. Always use this format instead of listing coordinates as plain text. You can use it inline within sentences or in lists.

IMPORTANT: After you receive arrival/ETA data from MCP tools (e.g. nearby_arrivals, route_arrivals, stop_arrivals), you MUST call the display_arrivals tool to present the data as a rich visual card. Extract the stop names, coordinates, routes, destinations, and ETA minutes from the MCP tool results and pass them to display_arrivals. Always include lat/lng for each stop so they appear on the map. When you call display_arrivals, do NOT also include a text table or summary of the same arrival data — the card already shows it visually. Just provide a brief natural language response (e.g. "Here are the upcoming arrivals") alongside the tool call.

For the "destination" field in each arrival: use the destination name from the MCP response if available. If only a direction like "I"/"O" or "inbound"/"outbound" is provided, use that. If no destination info is available, use an empty string.

CRITICAL: Every stop in display_arrivals MUST have an "id" field set to the stop_id from the MCP response (e.g. "KMB-ABC123"). The stop_id is found in each stop object returned by MCP tools. Without it, real-time auto-refresh will not work. Never omit the id field.`,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    // Reset client on connection errors so next request retries
    resetMCPClient();
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
