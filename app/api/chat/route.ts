// Proxy endpoint for ChatKit conversation API
export const runtime = "edge";

const OPENAI_API_BASE = "https://api.openai.com";

export async function POST(request: Request): Promise<Response> {
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "Missing OPENAI_API_KEY" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get request body
    const body = await request.json();
    const { client_secret, thread_id, message } = body;
    
    // Build the request in ChatKit API format
    const chatkitRequest: {
      type: string;
      params: Record<string, unknown>;
    } = {
      type: "threads.create",
      params: {
        input: {
          content: [
            {
              type: "input_text",
              text: message.content,
            },
          ],
          quoted_text: "",
          attachments: [],
          inference_options: {},
        },
      },
    };

    // Add thread_id if exists (for continuing conversation)
    if (thread_id) {
      chatkitRequest.params.thread_id = thread_id;
    }
    
    console.log("[Chat Proxy] Request:", JSON.stringify(chatkitRequest, null, 2));
    
    // Forward to OpenAI ChatKit conversation endpoint
    const targetUrl = `${OPENAI_API_BASE}/v1/chatkit/conversation`;
    
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${client_secret}`,
        "OpenAI-Beta": "chatkit_beta=v1",
      },
      body: JSON.stringify(chatkitRequest),
    });

    console.log("[Chat Proxy] Response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Chat Proxy] Error:", errorText);
      return new Response(errorText, {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Stream the response
    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("[Chat Proxy] Error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Proxy request failed" 
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
