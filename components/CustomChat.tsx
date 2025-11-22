"use client";

import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Message = {
  role: "user" | "assistant";
  content: string;
  id: string;
};

type Thread = {
  id: string;
  title: string;
  threadId: string | null;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
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
  
  // Thread management
  const [threads, setThreads] = useState<Thread[]>([]);
  const [currentThreadIndex, setCurrentThreadIndex] = useState(0);
  const [showThreadList, setShowThreadList] = useState(false);

  // Load threads from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("chat-threads");
    if (saved) {
      const loadedThreads = JSON.parse(saved) as Thread[];
      setThreads(loadedThreads);
      if (loadedThreads.length > 0) {
        setMessages(loadedThreads[0].messages);
        setThreadId(loadedThreads[0].threadId);
      }
    } else {
      // Create initial thread
      const initialThread: Thread = {
        id: Date.now().toString(),
        title: "New Chat",
        threadId: null,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setThreads([initialThread]);
    }
  }, []);

  // Save threads to localStorage whenever they change
  useEffect(() => {
    if (threads.length > 0) {
      localStorage.setItem("chat-threads", JSON.stringify(threads));
    }
  }, [threads]);

  // Update current thread when messages change
  useEffect(() => {
    if (threads.length > 0) {
      setThreads((prev) =>
        prev.map((thread, idx) =>
          idx === currentThreadIndex
            ? {
                ...thread,
                messages,
                threadId,
                updatedAt: Date.now(),
                title:
                  messages.length > 0 && thread.title === "New Chat"
                    ? messages[0].content.slice(0, 50) + "..."
                    : thread.title,
              }
            : thread
        )
      );
    }
  }, [messages, threadId, currentThreadIndex]);

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

  const createNewThread = () => {
    const newThread: Thread = {
      id: Date.now().toString(),
      title: "New Chat",
      threadId: null,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setThreads((prev) => [newThread, ...prev]);
    setCurrentThreadIndex(0);
    setMessages([]);
    setThreadId(null);
    setShowThreadList(false);
  };

  const switchThread = (index: number) => {
    setCurrentThreadIndex(index);
    setMessages(threads[index].messages);
    setThreadId(threads[index].threadId);
    setShowThreadList(false);
  };

  const deleteThread = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (threads.length === 1) {
      // Don't delete the last thread, just clear it
      setMessages([]);
      setThreadId(null);
      setThreads([{
        id: Date.now().toString(),
        title: "New Chat",
        threadId: null,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }]);
      return;
    }
    
    setThreads((prev) => prev.filter((_, idx) => idx !== index));
    if (currentThreadIndex >= index && currentThreadIndex > 0) {
      const newIndex = currentThreadIndex - 1;
      setCurrentThreadIndex(newIndex);
      setMessages(threads[newIndex].messages);
      setThreadId(threads[newIndex].threadId);
    } else if (currentThreadIndex === index) {
      setCurrentThreadIndex(0);
      setMessages(threads[0].messages);
      setThreadId(threads[0].threadId);
    }
  };

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
        <div className="flex items-center justify-between">
          <div className="relative flex-1">
            {/* Current thread title with icon controls */}
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex-1 truncate">
                {threads[currentThreadIndex]?.title || "New Chat"}
              </h2>
              
              {/* Icon controls */}
              <div className="flex items-center gap-1">
                {/* New chat icon */}
                <button
                  onClick={createNewThread}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="New chat"
                >
                  <svg className="w-5 h-5 text-slate-600 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                
                {/* History/dropdown icon */}
                <button
                  onClick={() => setShowThreadList(!showThreadList)}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="Chat history"
                >
                  <svg className={`w-5 h-5 text-slate-600 dark:text-slate-400 transition-transform ${showThreadList ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Dropdown Thread List */}
            {showThreadList && (
              <div className="absolute top-full right-0 mt-2 w-80 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-20 max-h-96 overflow-y-auto">
                {/* Thread List */}
                {threads.map((thread, idx) => (
                  <div
                    key={thread.id}
                    onClick={() => switchThread(idx)}
                    className={`group relative px-4 py-3 cursor-pointer transition-colors border-b border-slate-200 dark:border-slate-700 last:border-b-0 ${
                      idx === currentThreadIndex
                        ? "bg-slate-100 dark:bg-slate-700"
                        : "hover:bg-slate-50 dark:hover:bg-slate-750"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                          {thread.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {thread.messages.length} messages · {new Date(thread.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={(e) => deleteThread(idx, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/50 rounded transition-all"
                        title="Delete thread"
                      >
                        <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {clientSecret && (
          <p className="text-sm text-slate-500 mt-2">Session active</p>
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
