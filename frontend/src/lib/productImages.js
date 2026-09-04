// Customer-facing pages must never show an image a staff member has marked
// hidden — the backend keeps hidden images in the API response (so the
// admin panel can still see/un-hide them), so filtering happens here.
export function visibleImages(images) {
  return (images || []).filter((img) => !img.hidden);
}
