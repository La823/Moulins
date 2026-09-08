"use client";

import { useState, useRef, useEffect } from "react";
import { apiFetch } from "@/lib/api";

// Retrieval-augmented assistant over the logged-in partner's OWN doctors
// and meetings — POST /vector-search/ask is authenticated (not admin-only)
// and scoped server-side by the resolved owner id, so this never needs to
// pass or trust anything about identity itself; it just asks the question.
export default function DoctorMeetingAssistant() {
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
      const data = await apiFetch("/vector-search/ask", {
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
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-light text-gray-900">Assistant</h1>
        <p className="text-sm text-gray-500 mt-1">
          Ask about your own doctors and meeting history — this only ever sees your data, never another partner&apos;s.
        </p>
      </div>

      <div className="border border-gray-200 rounded-lg flex flex-col h-[60vh]">
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 && (
            <p className="text-sm text-gray-400 text-center mt-10">
              Ask something like &quot;when did I last meet Dr. Sharma&quot; or &quot;what doctors have I added this
              month&quot;
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
            placeholder="Ask about your doctors or meetings..."
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
