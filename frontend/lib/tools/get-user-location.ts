import { tool } from "ai";
import { z } from "zod/v4";

export const getUserLocationTool = tool({
  description:
    "Get the user's current GPS location. Call this when you need the user's coordinates to find nearby stops or provide location-based results. Returns latitude and longitude, or an error if location is unavailable.",
  inputSchema: z.object({}),
  // No execute — client-side tool
});
