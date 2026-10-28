"use client";

import { useState } from "react";

// A value counts as filled the same way the server checks it: yes/no
// answered either way, non-blank text or choice, an uploaded image.
const isFilled = (v) => (typeof v === "string" ? v.trim() !== "" : v !== null && v !== undefined);

/**
 * Which fields are shown, given the answers so far — the same rule the
 * server applies. A field with "show only when" appears when the field it
 * depends on is itself shown and holds one of the rule's answers.
 * Returns a Set of shown field ids.
 */
export function visibleFieldIds(fields, values) {
  const byId = new Map((fields || []).map((f) => [f.id, f]));
  const memo = new Map();
  const visible = (f, depth) => {
    if (memo.has(f.id)) return memo.get(f.id);
    let shown = true;
    if (f.show_if_field_id != null) {
      const ctrl = byId.get(f.show_if_field_id);
      if (!ctrl) shown = true; // the field it depended on is gone
      else if (depth > byId.size) shown = false; // a loop; never saved
      else shown = visible(ctrl, depth + 1) && (f.show_if_values || []).some((a) => a === values?.[ctrl.id]);
    }
    memo.set(f.id, shown);
    return shown;
  };
  return new Set((fields || []).filter((f) => visible(f, 0)).map((f) => f.id));
}

/** Where a field's comment is kept in the values, beside its answer. */
export const commentKey = (fieldId) => `${fieldId}_comment`;

/** The values with every hidden field's answer (and comment) dropped — what gets saved. */
export function withoutHidden(fields, values) {
  const shown = visibleFieldIds(fields, values);
  const ids = new Set((fields || []).map((f) => String(f.id)));
  return Object.fromEntries(
    Object.entries(values || {}).filter(([k]) => {
      const id = k.replace(/_comment$/, "");
      return !ids.has(id) || shown.has(Number(id));
    })
  );
}

/** Hidden fields that still hold an answer — cleared when saved. */
export function hiddenWithValues(fields, values) {
  const shown = visibleFieldIds(fields, values);
  return (fields || []).filter((f) => !shown.has(f.id) && isFilled(values?.[f.id]));
}

/** Names of the type's mandatory fields left empty — [] when all are filled. Hidden fields don't count. */
export function missingRequired(fields, values) {
  const shown = visibleFieldIds(fields, values);
  return (fields || [])
    .filter((f) => f.is_required && shown.has(f.id) && !isFilled(values?.[f.id]))
    .map((f) => f.field_name);
}

/** A field's label, with a red * when it's mandatory and its note (set on the Product Specifications page) under it. */
export function SpecFieldLabel({ field, className = "block text-xs font-medium text-gray-500 mb-1" }) {
  return (
    <>
      <label className={className}>
        {field.field_name}
        {field.is_required && <span className="text-red-500 ml-0.5" title="Required">*</span>}
      </label>
      {field.help_text && <p className="-mt-0.5 mb-1 text-[11px] text-gray-400">{field.help_text}</p>}
    </>
  );
}

/**
 * The optional comment under a field's answer — a "+ Comment" link until
 * there is one. `onChange(v)` sets it; null clears it.
 */
export function SpecFieldComment({ value, onChange, size = "sm" }) {
  const [open, setOpen] = useState(false);
  if (!open && !value) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 text-[11px] text-gray-400 hover:text-gray-700">
        + Comment
      </button>
    );
  }
  return (
    <textarea
      value={value ?? ""}
      autoFocus={open && !value}
      rows={1}
      onChange={(e) => onChange(e.target.value || null)}
      onBlur={() => setOpen(false)}
      placeholder="Comment"
      className={`mt-1 w-full border border-gray-200 rounded-md text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-400 resize-y ${
        size === "xs" ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs"
      }`}
    />
  );
}

// One product-specification field's input — text, yes/no, dropdown of its
// saved options, or an image upload. Shared by the product page and the
// Set Product Specifications page so both edit values the same way.
// `onUpload(file)` returns a promise for the uploaded image's URL.
export default function SpecFieldInput({ field: f, value, onChange, onUpload, uploading = false, size = "sm" }) {
  const cls =
    size === "xs"
      ? "w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-gray-400"
      : "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400";

  if (f.field_type === "boolean") {
    return (
      <select
        value={value === true ? "true" : value === false ? "false" : ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value === "true")}
        className={`${cls} bg-white`}
      >
        <option value="">—</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }
  if (f.field_type === "dropdown") {
    return (
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className={`${cls} bg-white`}>
        <option value="">—</option>
        {f.options.map((o) => (
          <option key={o.id} value={o.option_value}>
            {o.option_value}
          </option>
        ))}
        {/* a saved value whose option was since removed still shows */}
        {value && !f.options.some((o) => o.option_value === value) && <option value={value}>{value} (removed option)</option>}
      </select>
    );
  }
  if (f.field_type === "image") {
    return (
      <div className="space-y-1.5">
        {value && (
          <div className="flex items-center gap-2">
            <img src={value} alt={f.field_name} className="h-16 w-16 object-cover rounded-md border border-gray-200" />
            <button type="button" onClick={() => onChange(null)} className="text-xs text-red-500 hover:text-red-700">
              Remove
            </button>
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          disabled={uploading}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            const url = await onUpload(file);
            if (url) onChange(url);
          }}
          className="block w-full text-xs text-gray-500 file:mr-2 file:px-2 file:py-1 file:rounded-md file:border file:border-gray-300 file:text-xs file:bg-white hover:file:bg-gray-50"
        />
        {uploading && <p className="text-xs text-gray-400">Uploading…</p>}
      </div>
    );
  }
  return <input type="text" value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={cls} />;
}
