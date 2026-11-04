"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Markdown } from "@/components/shared/ProductAssistantChat";

// The stock agent: questions about stock, shortages and expiry, answered
// from live Marg data. Each answer shows the tool calls behind it, so its
// numbers can be traced to the report they came from. Every question is
// saved with its tokens; the bar at the top is today's use against the
// daily limit, and past questions reopen from the list.

const MAX_LEN = 500;

const SUGGESTIONS = [
  "Which products are running short with nothing on order?",
  "How much money is stuck in expired stock, and which products are the worst?",
  "Which stock is at risk of expiring before it sells?",
  "How is Volksmin doing?",
];

const usd = (n) => `$${(n || 0).toFixed(n >= 1 ? 2 : 4)}`;
const tok = (n) => (n || 0).toLocaleString("en-IN");

function UsageBar({ usage }) {
  if (!usage) return null;
  const pct = Math.min(100, (usage.today.tokens / usage.daily_limit) * 100);
  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-gray-600">
        <span>
          Today: <b className="text-gray-900">{tok(usage.today.tokens)}</b> of {tok(usage.daily_limit)} tokens · {usage.today.questions} question
          {usage.today.questions === 1 ? "" : "s"} · {usd(usage.today.cost_usd)}
        </span>
        <span className="text-gray-400">
          This month: {tok(usage.month.tokens)} tokens · {usd(usage.month.cost_usd)}
        </span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-gray-100">
        <div className={`h-1.5 rounded-full ${pct >= 90 ? "bg-red-500" : "bg-gray-400"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Steps({ steps, tokens }) {
  if (!steps?.length) return null;
  return (
    <details className="mt-2 text-xs text-gray-500">
      <summary className="cursor-pointer select-none hover:text-gray-700">
        {steps.length} tool call{steps.length === 1 ? "" : "s"} · {tokens.toLocaleString("en-IN")} tokens
      </summary>
      <ul className="mt-2 space-y-1 font-mono">
        {steps.map((s, i) => (
          <li key={i} className={s.error ? "text-red-600" : ""}>
            {s.tool}({JSON.stringify(s.input)}) · {(s.ms / 1000).toFixed(1)}s{s.error ? ` · ${s.error}` : ""}
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function StockAgentPage() {
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState(null);
  const [history, setHistory] = useState([]);
  const [reload, setReload] = useState(0);
  const endRef = useRef(null);

  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const [u, h] = await Promise.all([apiFetch("/admin/stock-agent/usage"), apiFetch("/admin/stock-agent/history?limit=30")]);
        if (!off) {
          setUsage(u);
          setHistory(h.entries);
        }
      } catch {
        /* the chat still works without them */
      }
    })();
    return () => {
      off = true;
    };
  }, [reload]);

  function reopen(e) {
    setMessages([
      { role: "user", text: e.question },
      e.answer
        ? { role: "assistant", text: e.answer, steps: e.steps, tokens: e.input_tokens + e.output_tokens }
        : { role: "assistant", text: e.error || "This question failed.", error: true },
    ]);
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  async function ask(text) {
    const q = text.trim();
    if (!q || loading) return;
    setQuestion("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setLoading(true);
    try {
      const res = await apiFetch("/admin/stock-agent/ask", { method: "POST", body: JSON.stringify({ question: q }) });
      setMessages((m) => [
        ...m,
        { role: "assistant", text: res.answer || "No answer came back.", steps: res.steps, tokens: res.input_tokens + res.output_tokens },
      ]);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", text: err.message || "Sorry, something went wrong. Please try again.", error: true }]);
    } finally {
      setLoading(false);
      setReload((n) => n + 1);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      <h1 className="text-2xl font-light text-gray-900 mb-6">Stock Agent</h1>
      <UsageBar usage={usage} />
      <div className="space-y-5">
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:border-red-300 hover:text-red-600 transition"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-red-600 px-4 py-2.5 text-white">{m.text}</div>
            </div>
          ) : (
            <div key={i} className="max-w-full">
              <div
                className={`rounded-2xl rounded-bl-md border px-5 py-4 text-[15px] leading-relaxed ${
                  m.error ? "border-red-200 bg-red-50 text-red-700" : "border-gray-100 bg-gray-50 text-gray-700"
                }`}
              >
                <Markdown text={m.text} />
              </div>
              <Steps steps={m.steps} tokens={m.tokens} />
            </div>
          )
        )}

        {loading && (
          <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-md border border-gray-100 bg-gray-50 px-5 py-4 text-sm text-gray-500">
            {[0, 150, 300].map((d) => (
              <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: `${d}ms` }} />
            ))}
            <span className="ml-1">Checking the stock reports…</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="sticky bottom-4 mt-8 flex items-end gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-lg"
      >
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value.slice(0, MAX_LEN))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(question);
            }
          }}
          rows={1}
          placeholder="Ask about stock, shortages or expiry…"
          className="flex-1 resize-none bg-transparent px-3 py-2.5 text-gray-900 outline-none placeholder:text-gray-400"
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40 transition"
        >
          Ask
        </button>
      </form>
      {history.length > 0 && (
        <details className="mt-8 text-sm">
          <summary className="cursor-pointer select-none text-gray-500 hover:text-gray-800">Your past questions ({history.length})</summary>
          <ul className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {history.map((e) => (
              <li key={e.id}>
                <button onClick={() => reopen(e)} className="flex w-full items-baseline gap-3 px-4 py-2.5 text-left hover:bg-gray-50">
                  <span className={`flex-1 truncate ${e.error ? "text-red-600" : "text-gray-800"}`}>{e.question}</span>
                  <span className="shrink-0 text-xs text-gray-400">
                    {tok(e.input_tokens + e.output_tokens)} tok · {new Date(e.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="mt-3 text-center text-xs text-gray-400">Answers come from live Marg stock and sales data. Open the tool calls under an answer to see where its numbers came from.</p>
    </div>
  );
}
