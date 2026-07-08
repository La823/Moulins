import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../models/product.dart';
import '../../providers/cart_provider.dart';
import '../../services/product_service.dart';

class ProductDetailScreen extends ConsumerStatefulWidget {
  final String productId;
  const ProductDetailScreen({super.key, required this.productId});

  @override
  ConsumerState<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends ConsumerState<ProductDetailScreen> {
  Product? _product;
  bool _loading = true;
  int _selectedImage = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final p = await ProductService().getProduct(widget.productId);
      setState(() { _product = p; _loading = false; });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator(color: Color(0xFF00A6A4))));
    }
    if (_product == null) {
      return Scaffold(appBar: AppBar(), body: const Center(child: Text('Product not found')));
    }

    final p = _product!;
    final cart = ref.watch(cartProvider);
    final inCart = cart.any((e) => e.product.id == p.id);

    return Scaffold(
      backgroundColor: Colors.white,
      body: CustomScrollView(
        slivers: [
          // Image header
          SliverAppBar(
            expandedHeight: 300,
            pinned: true,
            backgroundColor: Colors.white,
            foregroundColor: Colors.black,
            flexibleSpace: FlexibleSpaceBar(
              background: p.images.isEmpty
                  ? Container(color: Colors.grey.shade100, child: const Icon(Icons.medication_outlined, size: 80, color: Colors.grey))
                  : Stack(
                      children: [
                        CachedNetworkImage(
                          imageUrl: p.images[_selectedImage].imageUrl,
                          fit: BoxFit.cover,
                          width: double.infinity,
                          placeholder: (_, __) => Container(color: Colors.grey.shade100),
                          errorWidget: (_, __, ___) => Container(color: Colors.grey.shade100, child: const Icon(Icons.medication_outlined, size: 60, color: Colors.grey)),
                        ),
                        if (p.images.length > 1)
                          Positioned(
                            bottom: 12,
                            left: 0, right: 0,
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: p.images.asMap().entries.map((e) => GestureDetector(
                                onTap: () => setState(() => _selectedImage = e.key),
                                child: Container(
                                  width: 8, height: 8,
                                  margin: const EdgeInsets.symmetric(horizontal: 4),
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: _selectedImage == e.key ? const Color(0xFF00A6A4) : Colors.white.withValues(alpha: 0.6),
                                  ),
                                ),
                              )).toList(),
                            ),
                          ),
                      ],
                    ),
            ),
          ),

          // Details
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Categories
                  if (p.categories.isNotEmpty)
                    Wrap(
                      spacing: 6,
                      children: p.categories.map((cat) => Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: const Color(0xFF00A6A4).withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(cat, style: const TextStyle(fontSize: 11, color: Color(0xFF00A6A4), fontWeight: FontWeight.w500)),
                      )).toList(),
                    ),
                  const SizedBox(height: 12),

                  Text(p.name, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Color(0xFF1A1A1A))),
                  const SizedBox(height: 8),

                  Text(
                    'MRP Rs. ${(p.mrp ?? p.price).toStringAsFixed(2)}',
                    style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: Color(0xFF00A6A4)),
                  ),
                  const SizedBox(height: 16),

                  if (p.description.isNotEmpty) ...[
                    const Text('Description', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 6),
                    Text(p.description, style: TextStyle(fontSize: 14, color: Colors.grey.shade600, height: 1.5)),
                    const SizedBox(height: 16),
                  ],

                  // Details
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(color: Colors.grey.shade50, borderRadius: BorderRadius.circular(12)),
                    child: Column(
                      children: [
                        if (p.packSize != null) _detailRow('Pack Size', p.packSize!),
                        if (p.productForm != null) _detailRow('Form', p.productForm!),
                        _detailRow('Stock', 'In Stock', valueColor: Colors.green.shade600),
                      ],
                    ),
                  ),
                  const SizedBox(height: 100),
                ],
              ),
            ),
          ),
        ],
      ),

      // Add to cart button
      bottomNavigationBar: Container(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
        decoration: BoxDecoration(
          color: Colors.white,
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.08), blurRadius: 16, offset: const Offset(0, -4))],
        ),
        child: SizedBox(
          height: 52,
          child: ElevatedButton(
            onPressed: () {
                    ref.read(cartProvider.notifier).add(p);
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('${p.name} added to cart'), backgroundColor: const Color(0xFF00A6A4), behavior: SnackBarBehavior.floating),
                    );
                  },
            style: ElevatedButton.styleFrom(
              backgroundColor: inCart ? const Color(0xFF00A6A4).withValues(alpha: 0.8) : const Color(0xFF00A6A4),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              elevation: 0,
            ),
            child: Text(inCart ? 'Add More' : 'Add to Cart', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
          ),
        ),
      ),
    );
  }

  Widget _detailRow(String label, String value, {Color? valueColor}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
            Text(value, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: valueColor)),
          ],
        ),
      );
}
