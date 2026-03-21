import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";
import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import { getActiveStreamId } from "@/lib/chat-store";

const streamContext = createResumableStreamContext({
  waitUntil: after,
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  console.log(`[stream/GET] resume request for chatId=${id}`);

  const activeStreamId = await getActiveStreamId(id);
  console.log(`[stream/GET] activeStreamId=${activeStreamId}`);
  if (!activeStreamId) {
    return new Response(null, { status: 204 });
  }

  const resumeAt = new URL(req.url).searchParams.get("resumeAt");
  const stream = await streamContext.resumeExistingStream(
    activeStreamId,
    resumeAt ? parseInt(resumeAt) : undefined,
  );

  if (!stream) {
    return new Response(null, { status: 204 });
  }

  return new Response(stream, {
    headers: UI_MESSAGE_STREAM_HEADERS,
  });
}
