import { getMCPClient, resetMCPClient } from "@/lib/mcp-client";

interface StopRequest {
  id?: string;
  lat: number;
  lng: number;
}

interface MCPArrival {
  route: string;
  direction: string;
  destination: string;
  stop_id: string;
  eta: string;
  remark?: string;
}

interface MCPStop {
  stop_id: string;
  stop_name: string;
  lat: number;
  lon: number;
  arrivals: MCPArrival[];
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const stops: StopRequest[] = body.stops;

    if (!Array.isArray(stops) || stops.length === 0) {
      return Response.json({ error: "stops array required" }, { status: 400 });
    }

    const mcpClient = await getMCPClient();
    const tools = await mcpClient.tools();
    const nearbyArrivals = tools.nearby_arrivals;

    if (!nearbyArrivals?.execute) {
      return Response.json(
        { error: "nearby_arrivals tool not available" },
        { status: 503 }
      );
    }

    const results = await Promise.all(
      stops.map(async (stop) => {
        try {
          const result = await nearbyArrivals.execute!(
            { latitude: stop.lat, longitude: stop.lng, radius: 50 },
            { toolCallId: `refresh-${stop.id ?? `${stop.lat},${stop.lng}`}`, messages: [] }
          );

          // Parse MCP tool result
          let data: { stops?: MCPStop[] } = {};
          if (result && typeof result === "object" && "content" in result) {
            const content = (result as { content: { type: string; text?: string }[] }).content;
            const textPart = content?.find(
              (c) => c.type === "text" && c.text
            );
            if (textPart?.text) {
              try {
                data = JSON.parse(textPart.text);
              } catch {
                return null;
              }
            }
          }

          if (!data.stops?.length) return null;

          // Filter by stop_id if provided
          const mcpStops = stop.id
            ? data.stops.filter((s) => s.stop_id === stop.id)
            : data.stops;

          if (mcpStops.length === 0) return null;

          const mcpStop = mcpStops[0];
          const now = Date.now();

          // Group arrivals by route
          const routeMap = new Map<
            string,
            { destination: string; etas: { minutes: number; remarks?: string }[] }
          >();

          for (const arrival of mcpStop.arrivals) {
            const key = arrival.route;
            if (!routeMap.has(key)) {
              routeMap.set(key, {
                destination: arrival.destination || arrival.direction,
                etas: [],
              });
            }
            const etaTime = new Date(arrival.eta).getTime();
            const minutes = Math.max(0, Math.round((etaTime - now) / 60000));
            routeMap.get(key)!.etas.push({
              minutes,
              remarks: arrival.remark || undefined,
            });
          }

          return {
            id: mcpStop.stop_id,
            name: mcpStop.stop_name,
            lat: mcpStop.lat,
            lng: mcpStop.lon,
            arrivals: Array.from(routeMap.entries()).map(([route, info]) => ({
              route,
              destination: info.destination,
              etas: info.etas.sort((a, b) => a.minutes - b.minutes),
            })),
          };
        } catch {
          return null;
        }
      })
    );

    return Response.json({
      stops: results.filter(Boolean),
    });
  } catch (error) {
    resetMCPClient();
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
