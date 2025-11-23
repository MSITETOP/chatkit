// Proxy for ChatKit static files (chatkit.js, index.html, assets)
export const runtime = "edge";

const CHATKIT_CDN_BASE = "https://cdn.platform.openai.com";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  try {
    const { path } = await params;
    const fullPath = path.join("/");
    
    // Construct the target URL
    const targetUrl = `${CHATKIT_CDN_BASE}/${fullPath}`;
    
    // Get query string from original request
    const url = new URL(request.url);
    const queryString = url.search;
    
    const finalUrl = `${targetUrl}${queryString}`;
    
    console.log("[ChatKit Proxy] Fetching:", finalUrl);
    
    // Forward the request
    const response = await fetch(finalUrl, {
      headers: {
        "User-Agent": request.headers.get("User-Agent") || "ChatKit-Proxy",
        "Accept": request.headers.get("Accept") || "*/*",
        "Accept-Encoding": request.headers.get("Accept-Encoding") || "gzip, deflate, br",
      },
    });
    
    if (!response.ok) {
      console.error("[ChatKit Proxy] Upstream error:", response.status, response.statusText);
      return new Response(`Proxy error: ${response.statusText}`, {
        status: response.status,
      });
    }
    
    // Get content type
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    
    // Clone response to read body
    let body: ArrayBuffer = await response.arrayBuffer();
    
    // If this is chatkit.js, we need to patch it to use our proxy
    if (fullPath.includes('chatkit.js') || fullPath.includes('chatkit/index-')) {
      let content = new TextDecoder().decode(body);
      
      // Replace all OpenAI API URLs with our proxy
      content = content.replace(
        /https:\/\/api\.openai\.com/g,
        '/api/proxy/openai'
      );
      content = content.replace(
        /https:\/\/eu\.api\.openai\.com/g,
        '/api/proxy/openai'
      );
      content = content.replace(
        /https:\/\/cdn\.platform\.openai\.com/g,
        '/api/proxy/chatkit'
      );
      
      // Convert Uint8Array to ArrayBuffer
      const encoded = new TextEncoder().encode(content);
      body = encoded.buffer instanceof ArrayBuffer 
        ? encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength)
        : new Uint8Array(encoded).buffer;
      console.log("[ChatKit Proxy] Patched URLs in", fullPath);
    }
    
    // Create new response with CORS headers
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": response.headers.get("Cache-Control") || "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  } catch (error) {
    console.error("[ChatKit Proxy] Error:", error);
    return new Response(
      JSON.stringify({ error: "Proxy request failed" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
