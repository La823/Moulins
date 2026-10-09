import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../models/product.dart';

/// Small square product image, used wherever a product appears in a list —
/// the cart and the side cart today.
///
/// Reads [Product.cardImageUrl], which excludes images staff have marked
/// hidden, so this can never surface one on a customer-facing screen. Falls
/// back to the same pill icon the product card uses while loading, on error,
/// and when a product has no image at all.
class ProductThumbnail extends StatelessWidget {
  final Product product;
  final double size;

  const ProductThumbnail({super.key, required this.product, this.size = 60});

  @override
  Widget build(BuildContext context) {
    final url = product.cardImageUrl;

    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: Container(
        width: size,
        height: size,
        color: Colors.grey.shade100,
        padding: const EdgeInsets.all(4),
        child: url == null
            ? _fallback()
            : CachedNetworkImage(
                imageUrl: url,
                // contain, not cover: these are packs and strips shot on
                // white, and cropping them loses the pack edges.
                fit: BoxFit.contain,
                placeholder: (_, __) => _fallback(),
                errorWidget: (_, __, ___) => _fallback(),
              ),
      ),
    );
  }

  Widget _fallback() => Center(
        child: Icon(Icons.medication_outlined, color: Colors.grey.shade400, size: size * 0.4),
      );
}
