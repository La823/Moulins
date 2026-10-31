"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

// The product assistant chat, in the admin panel. The page passes the
// endpoint it asks and where product cards link.

const MAX_LEN = 500;

const SUGGESTIONS = [
  "Tell me about Planscar gel",
  "What are the benefits of Planscar injection?",
  "Do you have something for joint pain?",
];

// Answers come back as Markdown. This renders the small subset the
// assistant writes — headings, bullet and numbered lists, bold, paragraphs —
// as React elements, so nothing from the response is ever injected as HTML.
function inline(text, key) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={`${key}-${i}`} className="font-semibold text-gray-900">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    )
  );
}

function Markdown({ text }) {
  const blocks = [];
  let list = null;
  const flush = () => {
    if (list) blocks.push(list);
    list = null;
  };

  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);

    if (!line) return flush();
    if (heading) {
      flush();
      blocks.push(
        <h3 key={i} className="mt-4 first:mt-0 mb-1.5 text-sm font-semibold uppercase tracking-wide text-red-600">
          {inline(heading[2], i)}
        </h3>
      );
    } else if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [], key: i };
      }
      list.items.push(<li key={i}>{inline((bullet || numbered)[1], i)}</li>);
    } else {
      flush();
      blocks.push(
        <p key={i} className="mb-2 last:mb-0">
          {inline(line, i)}
        </p>
      );
    }
  });
  flush();

  return blocks.map((b) => {
    if (!b.items) return b;
    const Tag = b.ordered ? "ol" : "ul";
    return (
      <Tag key={b.key} className={`mb-2 space-y-1 pl-5 ${b.ordered ? "list-decimal" : "list-disc"}`}>
        {b.items}
      </Tag>
    );
  });
}

function ProductCards({ products, productHref }) {
  if (!products?.length) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-3">
      {products.map((p) => (
        <Link
          key={p.id}
          href={productHref(p.id)}
          className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-2 pr-4 hover:border-red-300 hover:shadow-sm transition"
        >
          {p.thumb_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.thumb_url} alt="" className="h-12 w-12 rounded-lg object-cover bg-gray-50" />
          ) : (
            <div className="h-12 w-12 rounded-lg bg-red-50" />
          )}
          <span className="text-sm font-medium text-gray-900">{p.name}</span>
        </Link>
      ))}
    </div>
  );
}

export default function ProductAssistantChat({ endpoint, productHref = (id) => `/products/${id}` }) {
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

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
      const res = await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({ question: q }),
      });
      setMessages((m) => [...m, { role: "assistant", text: res.answer, products: res.products }]);
    } catch (err) {
      const msg = /too many/i.test(err.message)
        ? "You've asked a lot of questions in a short time — please try again in a little while."
        : /busy/i.test(err.message)
          ? "The assistant is busy right now — please try again in a minute."
          : "Sorry, something went wrong. Please try again.";
      setMessages((m) => [...m, { role: "assistant", text: msg, error: true }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
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
              <ProductCards products={m.products} productHref={productHref} />
            </div>
          )
        )}

        {loading && (
          <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-gray-100 bg-gray-50 px-5 py-4">
            {[0, 150, 300].map((d) => (
              <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: `${d}ms` }} />
            ))}
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
          placeholder="Ask about a product…"
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
      <p className="mt-3 text-center text-xs text-gray-400">
        Answers come from our product information and are not medical advice — please consult your doctor.
      </p>
    </div>
  );
}
