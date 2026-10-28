"use client";

import { useEffect, useState } from "react";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { apiFetch } from "@/lib/api";

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "boolean", label: "Boolean (yes/no)" },
  { value: "dropdown", label: "Dropdown" },
  { value: "image", label: "Image" },
];

// Config UI for Product Manufacturer Specifications (PMS): define product
// types (capsule, tablet, syrup, ...), each with its own set of
// specification fields (text/boolean/dropdown), and for dropdown fields the
// persisted list of options. This only defines the shape — per-PO values
// are entered/stored elsewhere.
export default function ProductSpecificationsPage() {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedTypeId, setExpandedTypeId] = useState(null);

  const [newField, setNewField] = useState({}); // { [typeId]: { field_name, field_type } }
  const [creatingFieldFor, setCreatingFieldFor] = useState(null);

  const [newOption, setNewOption] = useState({}); // { [fieldId]: value }
  const [creatingOptionFor, setCreatingOptionFor] = useState(null);

  function loadTypes() {
    setLoading(true);
    setError("");
    apiFetch("/admin/product-specs/types")
      .then((data) => setTypes(data || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadTypes();
  }, []);

  async function createField(typeId) {
    const draft = newField[typeId] || {};
    const fieldName = (draft.field_name || "").trim();
    const fieldType = draft.field_type || "text";
    if (!fieldName) return;
    setCreatingFieldFor(typeId);
    setError("");
    try {
      await apiFetch(`/admin/product-specs/types/${typeId}/fields`, {
        method: "POST",
        body: JSON.stringify({ field_name: fieldName, field_type: fieldType, sort_order: 0, is_required: !!draft.is_required }),
      });
      setNewField((prev) => ({ ...prev, [typeId]: { field_name: "", field_type: "text", is_required: false } }));
      loadTypes();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingFieldFor(null);
    }
  }

  // Mandatory or optional — saved straight away, shown at once
  async function setRequired(fieldId, isRequired) {
    setError("");
    setTypes((prev) =>
      prev.map((t) => ({ ...t, fields: t.fields.map((f) => (f.id === fieldId ? { ...f, is_required: isRequired } : f)) }))
    );
    try {
      await apiFetch(`/admin/product-specs/fields/${fieldId}`, {
        method: "PATCH",
        body: JSON.stringify({ is_required: isRequired }),
      });
    } catch (err) {
      setError(err.message);
      loadTypes();
    }
  }

  // "Show only when…" — cond is { field_id, values } or null for always shown
  async function setShowIf(fieldId, cond) {
    setError("");
    try {
      await apiFetch(`/admin/product-specs/fields/${fieldId}`, {
        method: "PATCH",
        body: JSON.stringify({ show_if: cond }),
      });
      loadTypes();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }

  // drag-and-drop field order — moved at once, then saved; a refusal
  // (e.g. someone else changed the fields) reloads the real order
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  async function onFieldDragEnd(typeId, event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const type = types.find((t) => t.id === typeId);
    const from = type.fields.findIndex((f) => f.id === active.id);
    const to = type.fields.findIndex((f) => f.id === over.id);
    const fields = arrayMove(type.fields, from, to);
    setTypes((prev) => prev.map((t) => (t.id === typeId ? { ...t, fields } : t)));
    setError("");
    try {
      await apiFetch(`/admin/product-specs/types/${typeId}/field-order`, {
        method: "PUT",
        body: JSON.stringify({ field_ids: fields.map((f) => f.id) }),
      });
    } catch (err) {
      setError(err.message);
      loadTypes();
    }
  }

  async function deleteField(id) {
    if (!confirm("Delete this specification field and any dropdown options on it?")) return;
    setError("");
    try {
      await apiFetch(`/admin/product-specs/fields/${id}`, { method: "DELETE" });
      loadTypes();
    } catch (err) {
      setError(err.message);
    }
  }

  async function createOption(fieldId) {
    const value = (newOption[fieldId] || "").trim();
    if (!value) return;
    setCreatingOptionFor(fieldId);
    setError("");
    try {
      await apiFetch(`/admin/product-specs/fields/${fieldId}/options`, {
        method: "POST",
        body: JSON.stringify({ option_value: value, sort_order: 0 }),
      });
      setNewOption((prev) => ({ ...prev, [fieldId]: "" }));
      loadTypes();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingOptionFor(null);
    }
  }

  // rename a field or a dropdown option; resolves true once saved
  async function rename(path, body) {
    setError("");
    try {
      await apiFetch(path, { method: "PATCH", body: JSON.stringify(body) });
      loadTypes();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }

  async function deleteOption(id) {
    setError("");
    try {
      await apiFetch(`/admin/product-specs/options/${id}`, { method: "DELETE" });
      loadTypes();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Product Specifications</h2>
        <p className="text-sm text-gray-500">
          The specification fields for each product form — every form is listed, and a new form appears here as
          soon as it&apos;s created. A field can be text, yes/no, a dropdown with its own options, or an image.
        </p>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {!loading && types.length === 0 && (
        <p className="text-sm text-gray-500">No product forms yet — they come from the products page.</p>
      )}

      <div className="space-y-3">
        {types.map((t, index) => {
          const isExpanded = expandedTypeId === t.id;
          const draft = newField[t.id] || { field_name: "", field_type: "text" };
          // types come current forms first, then those whose form was removed
          const firstRemoved = t.product_form_id == null && (index === 0 || types[index - 1].product_form_id != null);
          return (
            <div key={t.id}>
            {firstRemoved && (
              <div className="pt-4 pb-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Removed forms</p>
                <p className="text-xs text-gray-400">
                  These forms were deleted. Their specifications are kept — create a form with the same name and it
                  gets them back.
                </p>
              </div>
            )}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpandedTypeId(isExpanded ? null : t.id)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-xs">{isExpanded ? "▾" : "▸"}</span>
                  <span className="font-medium text-gray-900 text-sm">{t.name}</span>
                  <span className="text-xs text-gray-400">
                    {t.fields.length} field{t.fields.length === 1 ? "" : "s"}
                  </span>
                  {t.product_form_id == null && (
                    <span className="text-[10px] uppercase tracking-wide text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                      form removed
                    </span>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-gray-100 px-4 py-3 space-y-3">
                  {t.fields.length === 0 && (
                    <p className="text-xs text-gray-400">No specification fields yet.</p>
                  )}
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => onFieldDragEnd(t.id, e)}>
                  <SortableContext items={t.fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                  {t.fields.map((f) => (
                    <SortableField key={f.id} id={f.id}>
                    {(handle) => (
                    <div className="border border-gray-200 rounded-lg p-3 bg-white">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            {...handle}
                            title="Drag to reorder"
                            aria-label={`Move ${f.field_name}`}
                            className="-ml-1 px-1 text-gray-300 hover:text-gray-600 cursor-grab active:cursor-grabbing touch-none"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M7 4a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm0 6a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm-1.5 7.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM16 4a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm-1.5 7.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM16 16a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
                            </svg>
                          </button>
                          <InlineRename
                            value={f.field_name}
                            onSave={(v) => rename(`/admin/product-specs/fields/${f.id}`, { field_name: v })}
                            textClass="text-sm text-gray-800 font-medium"
                          />
                          <span className="text-[10px] uppercase tracking-wide text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                            {f.field_type}
                          </span>
                          {f.is_required && (
                            <span className="text-[10px] uppercase tracking-wide text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                              Required
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={!!f.is_required}
                              onChange={(e) => setRequired(f.id, e.target.checked)}
                              className="rounded border-gray-300"
                            />
                            Required
                          </label>
                          <button
                            onClick={() => deleteField(f.id)}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            Delete field
                          </button>
                        </div>
                      </div>

                      <ShowIfEditor field={f} fields={t.fields} onSave={(cond) => setShowIf(f.id, cond)} />

                      {f.field_type === "dropdown" && (
                        <div className="mt-2 pl-1">
                          <ul className="space-y-1 mb-2">
                            {f.options.map((o) => (
                              <li key={o.id} className="flex items-center justify-between text-xs text-gray-700">
                                <InlineRename
                                  value={o.option_value}
                                  onSave={(v) => rename(`/admin/product-specs/options/${o.id}`, { option_value: v })}
                                  textClass=""
                                  hint="Products that have this option chosen are updated too."
                                />
                                <button
                                  onClick={() => deleteOption(o.id)}
                                  className="text-gray-400 hover:text-red-600"
                                >
                                  ✕
                                </button>
                              </li>
                            ))}
                            {f.options.length === 0 && (
                              <li className="text-xs text-gray-400">No options yet.</li>
                            )}
                          </ul>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={newOption[f.id] || ""}
                              onChange={(e) => setNewOption((prev) => ({ ...prev, [f.id]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") createOption(f.id);
                              }}
                              placeholder="New option value"
                              className="flex-1 px-2 py-1 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-gray-400"
                            />
                            <button
                              onClick={() => createOption(f.id)}
                              disabled={creatingOptionFor === f.id || !(newOption[f.id] || "").trim()}
                              className="px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    )}
                    </SortableField>
                  ))}
                  </SortableContext>
                  </DndContext>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={draft.field_name}
                      onChange={(e) =>
                        setNewField((prev) => ({ ...prev, [t.id]: { ...draft, field_name: e.target.value } }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") createField(t.id);
                      }}
                      placeholder="New field name"
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-gray-400"
                    />
                    <select
                      value={draft.field_type}
                      onChange={(e) =>
                        setNewField((prev) => ({ ...prev, [t.id]: { ...draft, field_type: e.target.value } }))
                      }
                      className="px-2 py-1.5 border border-gray-300 rounded-md text-xs bg-white focus:outline-none focus:ring-1 focus:ring-gray-400"
                    >
                      {FIELD_TYPES.map((ft) => (
                        <option key={ft.value} value={ft.value}>
                          {ft.label}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={!!draft.is_required}
                        onChange={(e) =>
                          setNewField((prev) => ({ ...prev, [t.id]: { ...draft, is_required: e.target.checked } }))
                        }
                        className="rounded border-gray-300"
                      />
                      Required
                    </label>
                    <button
                      onClick={() => createField(t.id)}
                      disabled={creatingFieldFor === t.id || !draft.field_name.trim()}
                      className="px-3 py-1.5 bg-gray-900 text-white rounded-md text-xs font-medium hover:bg-gray-800 disabled:opacity-50"
                    >
                      {creatingFieldFor === t.id ? "Adding…" : "Add Field"}
                    </button>
                  </div>
                </div>
              )}
            </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const answerLabel = (v) => (v === true ? "Yes" : v === false ? "No" : String(v));

// The "Show only when <field> is <answer>" rule on one field. Only Yes/No and
// dropdown fields of the same type can control it; a dropdown rule can match
// several options.
function ShowIfEditor({ field, fields, onSave }) {
  const controllers = fields.filter(
    (c) => c.id !== field.id && (c.field_type === "boolean" || c.field_type === "dropdown")
  );
  const current = fields.find((c) => c.id === field.show_if_field_id);
  const [editing, setEditing] = useState(false);
  const [ctrlId, setCtrlId] = useState(field.show_if_field_id ?? "");
  const [answers, setAnswers] = useState(field.show_if_values || []);
  const [saving, setSaving] = useState(false);
  const ctrl = fields.find((c) => c.id === Number(ctrlId));

  const start = () => {
    setCtrlId(field.show_if_field_id ?? "");
    setAnswers(field.show_if_values || []);
    setEditing(true);
  };
  const save = async (cond) => {
    setSaving(true);
    const ok = await onSave(cond);
    setSaving(false);
    if (ok) setEditing(false);
  };
  const toggle = (v) => setAnswers((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  if (!editing) {
    return (
      <div className="mt-1.5 text-xs">
        {current ? (
          <span className="text-indigo-700">
            Shown only when <span className="font-medium">{current.field_name}</span> is{" "}
            <span className="font-medium">{(field.show_if_values || []).map(answerLabel).join(" or ")}</span>
            <button onClick={start} className="ml-2 text-gray-500 hover:text-gray-900 underline">
              Change
            </button>
            <button onClick={() => save(null)} disabled={saving} className="ml-2 text-gray-500 hover:text-red-600 underline">
              Always show
            </button>
          </span>
        ) : controllers.length > 0 ? (
          <button onClick={start} className="text-gray-500 hover:text-gray-900">
            + Show only when…
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg bg-indigo-50/60 border border-indigo-100 p-2.5 space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-gray-600">Show only when</span>
        <select
          value={ctrlId}
          onChange={(e) => {
            setCtrlId(e.target.value ? Number(e.target.value) : "");
            setAnswers([]);
          }}
          className="px-2 py-1 border border-gray-300 rounded-md bg-white"
        >
          <option value="">choose a field…</option>
          {controllers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.field_name}
            </option>
          ))}
        </select>
        {ctrl && <span className="text-gray-600">is</span>}
        {ctrl?.field_type === "boolean" &&
          [true, false].map((v) => (
            <label key={String(v)} className="flex items-center gap-1 cursor-pointer">
              <input type="radio" name={`showif-${field.id}`} checked={answers[0] === v} onChange={() => setAnswers([v])} />
              {answerLabel(v)}
            </label>
          ))}
        {ctrl?.field_type === "dropdown" &&
          (ctrl.options.length === 0 ? (
            <span className="text-gray-400">that dropdown has no options yet</span>
          ) : (
            ctrl.options.map((o) => (
              <label key={o.id} className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={answers.includes(o.option_value)} onChange={() => toggle(o.option_value)} />
                {o.option_value}
              </label>
            ))
          ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => save({ field_id: Number(ctrlId), values: answers })}
          disabled={saving || !ctrl || answers.length === 0}
          className="px-2.5 py-1 bg-gray-900 text-white rounded-md font-medium disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save rule"}
        </button>
        <button onClick={() => setEditing(false)} className="text-gray-500 hover:text-gray-900">
          Cancel
        </button>
      </div>
    </div>
  );
}

// A name with an "Edit" link that turns it into a box — Enter or Save keeps
// the new text, Escape or Cancel puts the old one back.
function InlineRename({ value, onSave, textClass, hint }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  const start = () => {
    setDraft(value);
    setEditing(true);
  };
  const save = async () => {
    const v = draft.trim();
    if (!v || v === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const ok = await onSave(v);
    setSaving(false);
    if (ok) setEditing(false);
  };

  if (!editing) {
    return (
      <span className="flex items-center gap-2">
        <span className={textClass}>{value}</span>
        <button type="button" onClick={start} className="text-xs text-gray-400 hover:text-gray-900">
          Edit
        </button>
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2 text-xs">
      <input
        type="text"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        className="px-2 py-1 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-gray-400"
      />
      <button
        type="button"
        onClick={save}
        disabled={saving || !draft.trim()}
        className="px-2 py-1 bg-gray-900 text-white rounded-md font-medium disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
      <button type="button" onClick={() => setEditing(false)} className="text-gray-500 hover:text-gray-900">
        Cancel
      </button>
      {hint && <span className="w-full text-gray-400">{hint}</span>}
    </span>
  );
}

// One field card in the drag-to-reorder list. Only the grip handle starts a
// drag, so the card's checkboxes, buttons and inputs work as normal.
function SortableField({ id, children }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        position: "relative",
        zIndex: isDragging ? 10 : undefined,
        opacity: isDragging ? 0.85 : 1,
      }}
      className={isDragging ? "shadow-lg rounded-lg" : ""}
    >
      {children({ ref: setActivatorNodeRef, ...attributes, ...listeners })}
    </div>
  );
}
