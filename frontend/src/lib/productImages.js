// Customer-facing pages must never show an image a staff member has marked
// hidden — the backend keeps hidden images in the API response (so the
// admin panel can still see/un-hide them), so filtering happens here.
export function visibleImages(images) {
  return (images || []).filter((img) => !img.hidden);
}

// The picture a product card shows: the small thumbnail of the first image
// when there is one, so a page of cards doesn't download full-size originals.
// Only used while it was made from the current first image — if the first
// image has changed since, the card shows that image itself until someone
// regenerates the thumbnail. images is visibleImages(product.images).
export function cardImageUrl(product, images = visibleImages(product?.images)) {
  const first = images[0];
  if (!first) return "";
  if (product?.thumb_url && product.thumb_source_key === first.image_key) return product.thumb_url;
  return first.image_url;
}
