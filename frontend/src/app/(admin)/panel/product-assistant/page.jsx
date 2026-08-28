"use client";

import { useState, useRef, useEffect } from "react";
import { apiFetch } from "@/lib/api";

export default function ProductAssistantPage() {
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleAsk = async (e) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || asking) return;

    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setQuestion("");
    setAsking(true);
    setError("");

    try {
      const data = await apiFetch("/admin/vector-search/ask", {
        method: "POST",
        body: JSON.stringify({ question: q }),
      });
      setMessages((prev) => [...prev, { role: "assistant", text: data.answer }]);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-light text-gray-900">Product Assistant</h1>
        <p className="text-sm text-gray-500 mt-1">
          Experimental — ask questions about products currently embedded in the vector search index.
        </p>
      </div>

      <div className="border border-gray-200 rounded-lg flex flex-col h-[60vh]">
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 && (
            <p className="text-sm text-gray-400 text-center mt-10">
              Ask something like &quot;what do you have for asthma&quot; or &quot;any cardio-diabetic products under
              ₹1500&quot;
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] px-4 py-2.5 rounded-lg text-sm whitespace-pre-wrap ${
                  m.role === "user" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-900"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {asking && (
            <div className="flex justify-start">
              <div className="max-w-[80%] px-4 py-2.5 rounded-lg text-sm bg-gray-100 text-gray-400">Thinking...</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleAsk} className="border-t border-gray-200 p-3 flex items-center gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about products..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            disabled={asking}
          />
          <button
            type="submit"
            disabled={asking || !question.trim()}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            Ask
          </button>
        </form>
      </div>

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
    </div>
  );
}
