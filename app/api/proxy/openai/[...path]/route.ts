// Proxy for OpenAI API requests
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

    // Get the path from the URL
    const url = new URL(request.url);
    const apiPath = url.pathname.replace("/api/proxy/openai", "");
    const queryString = url.search;
    
    const targetUrl = `${OPENAI_API_BASE}${apiPath}${queryString}`;
    
    console.log("[OpenAI Proxy] Proxying POST to:", targetUrl);
    
    // Get request body
    const body = await request.arrayBuffer();
    
    // Forward headers
    const headers = new Headers();
    headers.set("Authorization", `Bearer ${openaiApiKey}`);
    headers.set("Content-Type", request.headers.get("Content-Type") || "application/json");
    
    // Forward OpenAI-specific headers
    const openaiHeaders = [
      "OpenAI-Beta",
      "OpenAI-Organization",
      "OpenAI-Project",
    ];
    
    for (const header of openaiHeaders) {
      const value = request.headers.get(header);
      if (value) {
        headers.set(header, value);
      }
    }
    
    // Make the request
    const response = await fetch(targetUrl, {
      method: "POST",
      headers,
      body,
    });
    
    // Get response body
    const responseBody = await response.arrayBuffer();
    
    // Forward response with CORS headers
    return new Response(responseBody, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  } catch (error) {
    console.error("[OpenAI Proxy] Error:", error);
    return new Response(
      JSON.stringify({ error: "Proxy request failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "Missing OPENAI_API_KEY" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const url = new URL(request.url);
    const apiPath = url.pathname.replace("/api/proxy/openai", "");
    const queryString = url.search;
    
    const targetUrl = `${OPENAI_API_BASE}${apiPath}${queryString}`;
    
    console.log("[OpenAI Proxy] Proxying GET to:", targetUrl);
    
    const headers = new Headers();
    headers.set("Authorization", `Bearer ${openaiApiKey}`);
    
    const response = await fetch(targetUrl, {
      method: "GET",
      headers,
    });
    
    const responseBody = await response.arrayBuffer();
    
    return new Response(responseBody, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  } catch (error) {
    console.error("[OpenAI Proxy] Error:", error);
    return new Response(
      JSON.stringify({ error: "Proxy request failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
