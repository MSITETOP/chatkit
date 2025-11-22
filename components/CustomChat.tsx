"use client";

import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Message = {
  role: "user" | "assistant";
  content: string;
  id: string;
};

export function CustomChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize session on mount
  useEffect(() => {
    initSession();
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const initSession = async () => {
    try {
      const response = await fetch("/api/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflow: { id: process.env.NEXT_PUBLIC_CHATKIT_WORKFLOW_ID },
          chatkit_configuration: {
            file_upload: { enabled: true },
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create session");
      }

      const data = await response.json();
      setClientSecret(data.client_secret);
      console.log("Session initialized:", data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initialize");
      console.error("Init error:", err);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !clientSecret || isLoading) return;

    const userMessage: Message = {
      role: "user",
      content: input.trim(),
      id: Date.now().toString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_secret: clientSecret,
          thread_id: threadId,
          message: {
            role: "user",
            content: userMessage.content,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";
      let assistantId = Date.now().toString();
      let newThreadId: string | null = null;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                console.log("SSE Event:", parsed);
                
                // Handle thread creation
                if (parsed.type === "thread.created" && parsed.thread?.id) {
                  newThreadId = parsed.thread.id;
                  console.log("Thread created:", newThreadId);
                }

                // Handle assistant message chunks - thread.item.updated
                if (parsed.type === "thread.item.updated" && parsed.update) {
                  const update = parsed.update;
                  
                  if (update.type === "assistant_message.content_part.text_delta") {
                    const text = update.delta || "";
                    assistantMessage += text;
                    
                    setMessages((prev) => {
                      const existing = prev.find((m) => m.id === assistantId);
                      if (existing) {
                        return prev.map((m) =>
                          m.id === assistantId
                            ? { ...m, content: assistantMessage }
                            : m
                        );
                      } else {
                        return [
                          ...prev,
                          {
                            role: "assistant",
                            content: assistantMessage,
                            id: assistantId,
                          },
                        ];
                      }
                    });
                  }
                }

                // Handle assistant message chunks - thread.item.delta (fallback)
                if (parsed.type === "thread.item.delta" && parsed.delta?.content) {
                  for (const content of parsed.delta.content) {
                    if (content.type === "text" && content.text) {
                      assistantMessage += content.text;
                      setMessages((prev) => {
                        const existing = prev.find((m) => m.id === assistantId);
                        if (existing) {
                          return prev.map((m) =>
                            m.id === assistantId
                              ? { ...m, content: assistantMessage }
                              : m
                          );
                        } else {
                          return [
                            ...prev,
                            {
                              role: "assistant",
                              content: assistantMessage,
                              id: assistantId,
                            },
                          ];
                        }
                      });
                    }
                  }
                }
              } catch (parseErr) {
                console.warn("Failed to parse SSE:", data, parseErr);
              }
            }
          }
        }
        
        // Update thread_id after conversation
        if (newThreadId && !threadId) {
          setThreadId(newThreadId);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
      console.error("Send error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-[90vh] w-full flex-col rounded-2xl bg-white shadow-sm dark:bg-slate-900">
      {/* Header */}
      <div className="border-b border-slate-200 p-4 dark:border-slate-700">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          AI Assistant
        </h2>
        {clientSecret && (
          <p className="text-sm text-slate-500">Session active</p>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-4 text-red-800 dark:bg-red-900/20 dark:text-red-200">
            {error}
          </div>
        )}

        {messages.length === 0 && !error && (
          <div className="flex h-full items-center justify-center">
            <p className="text-slate-500">Send a message to start chatting</p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`mb-4 ${
              message.role === "user" ? "text-right" : "text-left"
            }`}
          >
            <div
              className={`inline-block max-w-[80%] rounded-lg p-3 ${
                message.role === "user"
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
              }`}
            >
              {message.role === "assistant" ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      // Customize code blocks
                      code: ({ node, className, children, ...props }) => {
                        const match = /language-(\w+)/.exec(className || "");
                        const codeString = String(children).replace(/\n$/, "");
                        const [copied, setCopied] = useState(false);
                        
                        const handleCopy = () => {
                          navigator.clipboard.writeText(codeString);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        };
                        
                        return match ? (
                          <div className="relative group">
                            <button
                              onClick={handleCopy}
                              className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-700 hover:bg-slate-600 text-white px-2 py-1 rounded text-xs"
                              title="Copy code"
                            >
                              {copied ? "Copied!" : "Copy"}
                            </button>
                            <code
                              className={`${className} block bg-slate-900 text-slate-100 dark:bg-slate-950 p-3 pr-16 rounded text-sm overflow-x-auto`}
                              {...props}
                            >
                              {children}
                            </code>
                          </div>
                        ) : (
                          <code
                            className="bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded text-sm"
                            {...props}
                          >
                            {children}
                          </code>
                        );
                      },
                      // Customize links
                      a: ({ node, ...props }) => (
                        <a
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                          target="_blank"
                          rel="noopener noreferrer"
                          {...props}
                        />
                      ),
                      // Customize pre blocks
                      pre: ({ node, ...props }) => (
                        <pre
                          className="bg-slate-900 dark:bg-slate-950 p-0 rounded overflow-hidden"
                          {...props}
                        />
                      ),
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{message.content}</p>
              )}
            </div>
          </div>
        ))}
        
        {/* Loading indicator */}
        {isLoading && (
          <div className="mb-4 text-left">
            <div className="inline-block max-w-[80%] rounded-lg p-3 bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="border-t border-slate-200 p-4 dark:border-slate-700">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(e as unknown as React.FormEvent);
              }
            }}
            disabled={!clientSecret || isLoading}
            placeholder={
              !clientSecret
                ? "Initializing..."
                : "Type a message... (Shift+Enter for new line)"
            }
            rows={1}
            className="flex-1 resize-none rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:border-slate-500 focus:outline-none disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-400 max-h-40 overflow-y-auto"
          />
          <button
            type="submit"
            disabled={!clientSecret || !input.trim()}
            className="rounded-lg bg-slate-900 px-6 py-2 font-medium text-white transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:bg-slate-300 disabled:text-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 dark:disabled:bg-slate-700 whitespace-nowrap"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
