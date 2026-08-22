"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";

export default function HomepageContentPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [highlights, setHighlights] = useState(null);
  const [highlightsForm, setHighlightsForm] = useState(null);
  const [card1File, setCard1File] = useState(null);
  const [card2File, setCard2File] = useState(null);
  const [savingHighlights, setSavingHighlights] = useState(false);
  const [highlightsError, setHighlightsError] = useState("");
  const [highlightsSaved, setHighlightsSaved] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    apiFetch("/home-highlights")
      .then((data) => {
        setHighlights(data);
        setHighlightsForm(data);
      })
      .catch(console.error);
  }, [isAdmin]);

  const uploadHighlightImage = async (file) => {
    const { upload_url, key } = await apiFetch("/admin/home-highlights/upload-url", {
      method: "POST",
      body: JSON.stringify({ filename: file.name }),
    });
    await fetch(upload_url, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });
    return key;
  };

  const handleSaveHighlights = async (e) => {
    e.preventDefault();
    setSavingHighlights(true);
    setHighlightsError("");
    setHighlightsSaved(false);
    try {
      const payload = { ...highlightsForm };
      if (card1File) payload.card1_image_key = await uploadHighlightImage(card1File);
      if (card2File) payload.card2_image_key = await uploadHighlightImage(card2File);

      await apiFetch("/admin/home-highlights", {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      const fresh = await apiFetch("/home-highlights");
      setHighlights(fresh);
      setHighlightsForm(fresh);
      setCard1File(null);
      setCard2File(null);
      setHighlightsSaved(true);
      setTimeout(() => setHighlightsSaved(false), 2500);
    } catch (err) {
      setHighlightsError(err.message);
    } finally {
      setSavingHighlights(false);
    }
  };

  const [carouselSlides, setCarouselSlides] = useState(null);
  const [addingSlide, setAddingSlide] = useState(false);

  const handleAddSlide = async () => {
    setAddingSlide(true);
    try {
      const slide = await apiFetch("/admin/home-carousel", { method: "POST" });
      setCarouselSlides((prev) => [...(prev || []), slide]);
    } catch (err) {
      alert(err.message);
    } finally {
      setAddingSlide(false);
    }
  };

  const handleDeleteSlide = async (position) => {
    if (!confirm("Delete this carousel slide?")) return;
    try {
      await apiFetch(`/admin/home-carousel/${position}`, { method: "DELETE" });
      setCarouselSlides((prev) => prev.filter((s) => s.position !== position));
    } catch (err) {
      alert(err.message);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    apiFetch("/home-carousel")
      .then(setCarouselSlides)
      .catch(console.error);
  }, [isAdmin]);

  const [focusForm, setFocusForm] = useState(null);
  const [focusCards, setFocusCards] = useState(null);
  const [savingFocus, setSavingFocus] = useState(false);
  const [focusError, setFocusError] = useState("");
  const [focusSaved, setFocusSaved] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    apiFetch("/home-focus")
      .then((data) => {
        setFocusForm({ heading: data.heading, description: data.description });
        setFocusCards(data.cards);
      })
      .catch(console.error);
  }, [isAdmin]);

  const handleSaveFocusSection = async (e) => {
    e.preventDefault();
    setSavingFocus(true);
    setFocusError("");
    setFocusSaved(false);
    try {
      await apiFetch("/admin/home-focus", {
        method: "PUT",
        body: JSON.stringify(focusForm),
      });
      setFocusSaved(true);
      setTimeout(() => setFocusSaved(false), 2500);
    } catch (err) {
      setFocusError(err.message);
    } finally {
      setSavingFocus(false);
    }
  };

  if (!isAdmin) {
    return <p className="text-gray-500">You don&apos;t have access to this page.</p>;
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800">Homepage Content</h2>
      </div>

      {/* Home Highlights section — the "Explore Our Most Curated Collection" block on the homepage */}
      {highlightsForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8 max-w-3xl">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Home Highlights Section</h3>

          <form onSubmit={handleSaveHighlights} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Section heading</label>
              <input
                type="text"
                value={highlightsForm.heading}
                onChange={(e) => setHighlightsForm({ ...highlightsForm, heading: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {[1, 2].map((n) => {
                const imgKey = `card${n}_image_url`;
                const btnKey = `card${n}_button_text`;
                const linkKey = `card${n}_link_url`;
                const file = n === 1 ? card1File : card2File;
                const setFile = n === 1 ? setCard1File : setCard2File;
                const previewUrl = file ? URL.createObjectURL(file) : highlightsForm[imgKey];
                return (
                  <div key={n} className="border border-gray-200 rounded-lg p-4">
                    <p className="text-xs font-medium text-gray-500 mb-2">Card {n}</p>
                    {previewUrl ? (
                      <img src={previewUrl} alt="" className="w-full h-32 object-cover rounded-lg mb-3" />
                    ) : (
                      <div className="w-full h-32 bg-gray-50 rounded-lg mb-3 flex items-center justify-center text-xs text-gray-300">
                        No image
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      className="w-full text-xs text-gray-500 mb-3"
                    />
                    <label className="block text-xs font-medium text-gray-500 mb-1">Button text</label>
                    <input
                      type="text"
                      value={highlightsForm[btnKey]}
                      onChange={(e) => setHighlightsForm({ ...highlightsForm, [btnKey]: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 mb-3"
                    />
                    <label className="block text-xs font-medium text-gray-500 mb-1">Button link</label>
                    <input
                      type="text"
                      value={highlightsForm[linkKey]}
                      onChange={(e) => setHighlightsForm({ ...highlightsForm, [linkKey]: e.target.value })}
                      placeholder="/products"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                    />
                  </div>
                );
              })}
            </div>

            {highlightsError && <p className="text-sm text-red-600">{highlightsError}</p>}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={savingHighlights}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {savingHighlights ? "Saving..." : "Save Changes"}
              </button>
              {highlightsSaved && <span className="text-sm text-green-600">Saved</span>}
            </div>
          </form>
        </div>
      )}

      {/* Home Carousel — the "Custom Branding" style carousel on the homepage */}
      {carouselSlides && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8 max-w-5xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">
              Home Carousel ({carouselSlides.length} slide{carouselSlides.length === 1 ? "" : "s"})
            </h3>
            <button
              onClick={handleAddSlide}
              disabled={addingSlide}
              className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {addingSlide ? "Adding..." : "+ Add Slide"}
            </button>
          </div>
          {carouselSlides.length === 0 ? (
            <p className="text-sm text-gray-400">No slides yet</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {carouselSlides.map((slide) => (
                <CarouselSlideEditor
                  key={slide.position}
                  slide={slide}
                  onSaved={(updated) =>
                    setCarouselSlides((prev) =>
                      prev.map((s) => (s.position === updated.position ? updated : s))
                    )
                  }
                  onDelete={() => handleDeleteSlide(slide.position)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Areas of Focus — heading/description + 4 image cards on the homepage */}
      {focusForm && focusCards && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8 max-w-5xl">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Areas of Focus</h3>

          <form onSubmit={handleSaveFocusSection} className="space-y-3 mb-6 pb-6 border-b border-gray-100">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Heading</label>
              <input
                type="text"
                value={focusForm.heading}
                onChange={(e) => setFocusForm({ ...focusForm, heading: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
              <textarea
                value={focusForm.description}
                onChange={(e) => setFocusForm({ ...focusForm, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
            {focusError && <p className="text-sm text-red-600">{focusError}</p>}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={savingFocus}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {savingFocus ? "Saving..." : "Save Heading & Description"}
              </button>
              {focusSaved && <span className="text-sm text-green-600">Saved</span>}
            </div>
          </form>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {focusCards.map((card) => (
              <FocusCardEditor
                key={card.position}
                card={card}
                onSaved={(updated) =>
                  setFocusCards((prev) =>
                    prev.map((c) => (c.position === updated.position ? updated : c))
                  )
                }
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function CarouselSlideEditor({ slide, onSaved, onDelete }) {
  const [form, setForm] = useState(slide);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const previewUrl = file ? URL.createObjectURL(file) : form.image_url;

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const payload = { ...form };
      if (file) {
        const { upload_url, key } = await apiFetch("/admin/home-carousel/upload-url", {
          method: "POST",
          body: JSON.stringify({ filename: file.name }),
        });
        await fetch(upload_url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });
        payload.image_key = key;
      }

      await apiFetch(`/admin/home-carousel/${slide.position}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      const fresh = await apiFetch("/home-carousel");
      const updated = fresh.find((s) => s.position === slide.position);
      setForm(updated);
      onSaved(updated);
      setFile(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-gray-500">Slide {slide.position}</p>
        <button
          type="button"
          onClick={onDelete}
          className="text-xs text-red-500 hover:text-red-700"
        >
          Delete
        </button>
      </div>
      {previewUrl ? (
        <img src={previewUrl} alt="" className="w-full h-32 object-cover rounded-lg mb-3" />
      ) : (
        <div className="w-full h-32 bg-gray-50 rounded-lg mb-3 flex items-center justify-center text-xs text-gray-300">
          No image
        </div>
      )}
      <input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="w-full text-xs text-gray-500 mb-3"
      />
      <label className="block text-xs font-medium text-gray-500 mb-1">Heading</label>
      <input
        type="text"
        value={form.heading}
        onChange={(e) => setForm({ ...form, heading: e.target.value })}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 mb-3"
      />
      <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
      <textarea
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        rows={3}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 mb-3"
      />
      <label className="block text-xs font-medium text-gray-500 mb-1">Button text</label>
      <input
        type="text"
        value={form.button_text}
        onChange={(e) => setForm({ ...form, button_text: e.target.value })}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 mb-3"
      />
      <label className="block text-xs font-medium text-gray-500 mb-1">Button link</label>
      <input
        type="text"
        value={form.button_link}
        onChange={(e) => setForm({ ...form, button_link: e.target.value })}
        placeholder="/products"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 mb-3"
      />
      <label className="block text-xs font-medium text-gray-500 mb-1">Card background color</label>
      <div className="flex items-center gap-2 mb-3">
        <input
          type="color"
          value={form.card_color || "#4E1111"}
          onChange={(e) => setForm({ ...form, card_color: e.target.value })}
          className="w-10 h-10 border border-gray-300 rounded-lg cursor-pointer p-0.5"
        />
        <input
          type="text"
          value={form.card_color || "#4E1111"}
          onChange={(e) => setForm({ ...form, card_color: e.target.value })}
          placeholder="#4E1111"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
        />
      </div>

      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Slide"}
        </button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
      </div>
    </form>
  );
}

function FocusCardEditor({ card, onSaved }) {
  const [form, setForm] = useState(card);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const previewUrl = file ? URL.createObjectURL(file) : form.image_url;

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const payload = { ...form };
      if (file) {
        const { upload_url, key } = await apiFetch("/admin/home-focus/upload-url", {
          method: "POST",
          body: JSON.stringify({ filename: file.name }),
        });
        await fetch(upload_url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });
        payload.image_key = key;
      }

      await apiFetch(`/admin/home-focus/cards/${card.position}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      const fresh = await apiFetch("/home-focus");
      const updated = fresh.cards.find((c) => c.position === card.position);
      setForm(updated);
      onSaved(updated);
      setFile(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="border border-gray-200 rounded-lg p-4">
      <p className="text-xs font-medium text-gray-500 mb-2">Card {card.position}</p>
      {previewUrl ? (
        <img src={previewUrl} alt="" className="w-full h-32 object-cover rounded-lg mb-3" />
      ) : (
        <div className="w-full h-32 bg-gray-50 rounded-lg mb-3 flex items-center justify-center text-xs text-gray-300">
          No image
        </div>
      )}
      <input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="w-full text-xs text-gray-500 mb-3"
      />
      <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
      <input
        type="text"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 mb-3"
      />
      <label className="block text-xs font-medium text-gray-500 mb-1">Link</label>
      <input
        type="text"
        value={form.link_url}
        onChange={(e) => setForm({ ...form, link_url: e.target.value })}
        placeholder="/products"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 mb-3"
      />

      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Card"}
        </button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
      </div>
    </form>
  );
}
