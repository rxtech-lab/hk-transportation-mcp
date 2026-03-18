import {
  streamText,
  generateText,
  Output,
  convertToModelMessages,
  stepCountIs,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import {
  AI_GATEWAY_API_KEY,
  AI_GATEWAY_URL,
  AI_MODEL,
} from "@/lib/config";
import { getMCPClient, resetMCPClient } from "@/lib/mcp-client";
import { displayArrivalsTool } from "@/lib/tools/display-arrivals";

const openai = createOpenAI({
  baseURL: AI_GATEWAY_URL,
  apiKey: AI_GATEWAY_API_KEY,
});

async function isHongKongTransportationQuery(
  modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>,
): Promise<boolean> {
  const { output: classification } = await generateText({
    model: AI_MODEL,
    output: Output.choice({ options: ["YES", "NO"] }),
    messages: modelMessages,
    system: `You are a strict classifier.

Determine whether the user is asking about transportation in Hong Kong.
Return exactly one word: YES or NO.

Return YES only when the user intent is about Hong Kong transportation (for example: bus routes, stops, arrivals, fares, directions, MTR, ferries, trams, minibuses, transit planning in Hong Kong).
Return NO for everything else.`,
  });

  return classification === "YES";
}

export async function POST(req: Request) {
  try {
    const { messages, latitude, longitude } = await req.json();

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

    const locationInfo =
      latitude && longitude
        ? `User's current location: ${latitude}, ${longitude}`
        : "User's location is unknown.";

    const result = streamText({
      model: AI_MODEL,
      tools: { ...tools, display_arrivals: displayArrivalsTool },
      messages: modelMessages,
      stopWhen: stepCountIs(20),
      system: `You are an HK bus transportation assistant. Help users find bus routes, nearby stops, and arrival times in Hong Kong.

${locationInfo}

IMPORTANT: When mentioning any location, bus stop, or place with known coordinates, you MUST use this special syntax:
📍[Location Name](latitude,longitude)

Examples:
- 📍[田灣商場 Tin Wan Shopping Centre](22.251066,114.149745)
- 📍[中環站 Central Station](22.2819,114.1588)

This syntax will be rendered as an interactive button that shows the location on a map. Always use this format instead of listing coordinates as plain text. You can use it inline within sentences or in lists.

IMPORTANT: After you receive arrival/ETA data from MCP tools (e.g. nearby_arrivals, route_arrivals, stop_arrivals), you MUST call the display_arrivals tool to present the data as a rich visual card. Extract the stop names, coordinates, routes, destinations, and ETA minutes from the MCP tool results and pass them to display_arrivals. Always include lat/lng for each stop so they appear on the map.

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
