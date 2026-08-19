import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../models/product.dart';
import '../providers/favorites_provider.dart';
import '../providers/auth_provider.dart';

class ProductCard extends ConsumerWidget {
  final Product product;
  final VoidCallback onTap;
  final VoidCallback onAddToCart;

  const ProductCard({
    super.key,
    required this.product,
    required this.onTap,
    required this.onAddToCart,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isFavorite = ref.watch(favoritesProvider).contains(product.id);
    final canOrder = ref.watch(authProvider).user?.role != 'doctor';

    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: Colors.grey.shade200),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image
            Expanded(
              child: Stack(
                children: [
                  ClipRRect(
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
                    child: SizedBox(
                      width: double.infinity,
                      height: double.infinity,
                      child: product.primaryImageUrl != null
                          ? CachedNetworkImage(
                              imageUrl: product.primaryImageUrl!,
                              fit: BoxFit.cover,
                              width: double.infinity,
                              placeholder: (_, __) => Container(color: Colors.grey.shade100, child: const Center(child: Icon(Icons.medication_outlined, color: Colors.grey))),
                              errorWidget: (_, __, ___) => Container(color: Colors.grey.shade100, child: const Center(child: Icon(Icons.medication_outlined, color: Colors.grey))),
                            )
                          : Container(
                              color: Colors.grey.shade100,
                              child: const Center(child: Icon(Icons.medication_outlined, color: Colors.grey, size: 36)),
                            ),
                    ),
                  ),
                  Positioned(
                    top: 6, right: 6,
                    child: GestureDetector(
                      onTap: () => ref.read(favoritesProvider.notifier).toggle(product),
                      child: Container(
                        width: 28, height: 28,
                        decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.9), shape: BoxShape.circle),
                        child: Icon(
                          isFavorite ? Icons.star : Icons.star_border,
                          color: isFavorite ? const Color(0xFFF5A623) : Colors.grey.shade400,
                          size: 18,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Info
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (product.categories.isNotEmpty)
                    Text(product.categories.first, style: const TextStyle(fontSize: 10, color: Color(0xFF00A6A4), fontWeight: FontWeight.w500), maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 2),
                  Text(product.name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF1A1A1A)), maxLines: 2, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 4),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          'MRP Rs. ${(product.mrp ?? product.price).toStringAsFixed(2)}',
                          style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold, color: Color(0xFF00A6A4)),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (canOrder)
                        GestureDetector(
                          onTap: onAddToCart,
                          child: Container(
                            width: 28, height: 28,
                            decoration: const BoxDecoration(color: Color(0xFF00A6A4), shape: BoxShape.circle),
                            child: const Icon(Icons.add, color: Colors.white, size: 18),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 6),
          ],
        ),
      ),
    );
  }
}
