"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import SpecFieldInput, {
  SpecFieldLabel,
  SpecFieldComment,
  commentKey,
  missingRequired,
  visibleFieldIds,
  withoutHidden,
  hiddenWithValues,
} from "@/components/admin/SpecFieldInput";

// The product page's default specifications: the fields set up on the
// Product Specifications page for this product's form (e.g. Capsules), with
// the values for this product. Saved to products.pms_specifications, keyed
// by field id; new purchase orders for the product copy them.
//
// `formChanged` is true while the form dropdown above has an unsaved change
// — these fields follow the saved form, so we say so instead of guessing.
export default function ProductSpecsSection({ productId, formChanged }) {
  const [data, setData] = useState(null);
  const [values, setValues] = useState({});
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingFieldId, setUploadingFieldId] = useState(null);
  const [message, setMessage] = useState(null); // { type: "ok" | "error", text }

  const apply = (d) => {
    setData(d);
    let v = d?.specifications || {};
    if (typeof v === "string") {
      try {
        v = JSON.parse(v);
      } catch {
        v = {};
      }
    }
    setValues(v || {});
    setDirty(false);
  };

  const load = () => {
    setLoading(true);
    apiFetch(`/admin/products/${productId}/specifications`)
      .then(apply)
      .catch((err) => setMessage({ type: "error", text: err.message }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const setValue = (fieldId, v) => {
    setValues((prev) => ({ ...prev, [fieldId]: v }));
    setDirty(true);
    setMessage(null);
  };

  const upload = async (fieldId, file) => {
    setUploadingFieldId(fieldId);
    try {
      const { upload_url, image_url } = await apiFetch(`/admin/products/${productId}/specifications/upload-url`, {
        method: "POST",
        body: JSON.stringify({ filename: file.name }),
      });
      await fetch(upload_url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      return image_url;
    } catch (err) {
      setMessage({ type: "error", text: err.message });
      return null;
    } finally {
      setUploadingFieldId(null);
    }
  };

  const save = async () => {
    const missing = missingRequired(data?.type?.fields, values);
    if (missing.length) {
      setMessage({ type: "error", text: `Please fill in the required fields: ${missing.join(", ")}` });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const d = await apiFetch(`/admin/products/${productId}/specifications`, {
        method: "PUT",
        body: JSON.stringify({ specifications: withoutHidden(data?.type?.fields, values) }),
      });
      if (d) apply(d);
      else setDirty(false);
      setMessage({ type: "ok", text: "Specifications saved" });
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const type = data?.type;
  // values saved earlier under a different form's type
  const savedForOtherType =
    data?.saved_pms_type_id != null && type && data.saved_pms_type_id !== type.id && Object.keys(values).length > 0;

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Product Specifications</h3>
          <p className="text-xs text-gray-400 mt-1">
            Default specifications for this product
            {data?.product_form ? ` — fields for ${data.product_form}` : ""}. New purchase orders for it carry these.
          </p>
        </div>
        <Link href="/panel/product-specifications" className="text-xs text-blue-600 hover:underline whitespace-nowrap">
          Manage fields
        </Link>
      </div>

      {formChanged && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          You&apos;ve changed the product form above. Save the product first — these fields follow its saved form.
        </p>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : !data?.product_form_id ? (
        <p className="text-sm text-gray-500">Choose a product form above and save, to see its specification fields.</p>
      ) : !type ? (
        <p className="text-sm text-gray-500">
          No specification fields are set up for <span className="font-medium">{data.product_form}</span> yet.{" "}
          <Link href="/panel/product-specifications" className="text-blue-600 hover:underline">
            Add them on the Product Specifications page
          </Link>
          .
        </p>
      ) : type.fields.length === 0 ? (
        <p className="text-sm text-gray-500">
          The {type.name} type has no fields yet.{" "}
          <Link href="/panel/product-specifications" className="text-blue-600 hover:underline">
            Add fields
          </Link>
          .
        </p>
      ) : (
        <>
          {savedForOtherType && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              The saved specifications were for {data.saved_type_name || "another form"}. Saving here replaces them with{" "}
              {type.name}&apos;s fields.
            </p>
          )}
          {hiddenWithValues(type.fields, values).length > 0 && (
            <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
              Answers in fields that are now hidden ({hiddenWithValues(type.fields, values).map((f) => f.field_name).join(", ")})
              will be cleared when you save.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {type.fields.filter((f) => visibleFieldIds(type.fields, values).has(f.id)).map((f) => (
              <div key={f.id}>
                <SpecFieldLabel field={f} />
                <SpecFieldInput
                  field={f}
                  value={values[f.id]}
                  onChange={(v) => setValue(f.id, v)}
                  onUpload={(file) => upload(f.id, file)}
                  uploading={uploadingFieldId === f.id}
                />
                <SpecFieldComment value={values[commentKey(f.id)]} onChange={(v) => setValue(commentKey(f.id), v)} />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save specifications"}
            </button>
            {dirty && !saving && (
              <button type="button" onClick={load} className="text-xs text-gray-500 hover:text-gray-900">
                Discard changes
              </button>
            )}
            {message && (
              <span className={`text-xs ${message.type === "ok" ? "text-green-600" : "text-red-600"}`}>{message.text}</span>
            )}
          </div>
        </>
      )}
      {!type && message?.type === "error" && <p className="text-xs text-red-600">{message.text}</p>}
    </section>
  );
}
