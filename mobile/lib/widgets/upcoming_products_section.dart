import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:go_router/go_router.dart';
import '../models/product.dart';
import '../providers/auth_provider.dart';
import '../services/product_service.dart';

const _ink = Color(0xFF1A1A1A);

class _Accent {
  final Color bg;
  final Color border;
  final Color solid;
  const _Accent(this.bg, this.border, this.solid);
}

const _accents = [
  _Accent(Color(0xFFFDF1F5), Color(0xFFF6D5E3), Color(0xFFE85D8C)),
  _Accent(Color(0xFFEFFBFA), Color(0xFFCDEFEC), Color(0xFF00A6A4)),
  _Accent(Color(0xFFF6F1FC), Color(0xFFE1D4F5), Color(0xFF8E5FD1)),
];

// Any product tagged "Upcoming" in admin — mirrors the website homepage's
// "Upcoming Products" row (same pastel-accent card design, i % 3 color cycle).
class UpcomingProductsSection extends ConsumerStatefulWidget {
  const UpcomingProductsSection({super.key});

  @override
  ConsumerState<UpcomingProductsSection> createState() => _UpcomingProductsSectionState();
}

class _UpcomingProductsSectionState extends ConsumerState<UpcomingProductsSection> {
  List<Product> _products = [];
  bool _fetched = false;

  void _fetch() {
    _fetched = true;
    ProductService().getProducts(tag: 'Upcoming', limit: 20).then((res) {
      if (mounted) setState(() => _products = res.products);
    }).catchError((_) {});
  }

  @override
  Widget build(BuildContext context) {
    final loggedIn = ref.watch(authProvider).user != null;
    if (!loggedIn) return const SizedBox.shrink();
    if (!_fetched) _fetch();
    if (_products.isEmpty) return const SizedBox.shrink();

    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(20, 28, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Column(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFDF1F5),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: const Color(0xFFF6D5E3)),
                  ),
                  child: const Text('COMING SOON',
                      style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: Color(0xFFE85D8C), letterSpacing: 0.8)),
                ),
                const SizedBox(height: 10),
                const Text('Upcoming Products',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600, color: _ink)),
                const SizedBox(height: 4),
                Container(width: 40, height: 3, decoration: BoxDecoration(color: const Color(0xFFE85D8C), borderRadius: BorderRadius.circular(2))),
              ],
            ),
          ),
          const SizedBox(height: 18),
          SizedBox(
            height: 300,
            child: ScrollConfiguration(
              behavior: ScrollConfiguration.of(context).copyWith(scrollbars: false),
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _products.length,
                separatorBuilder: (_, __) => const SizedBox(width: 14),
                itemBuilder: (context, i) {
                  final p = _products[i];
                  final accent = _accents[i % _accents.length];
                  return SizedBox(
                    width: 220,
                    child: _UpcomingCard(product: p, accent: accent, onTap: () => context.push('/products/${p.id}')),
                  );
                },
              ),
            ),
          ),
          const SizedBox(height: 16),
          Center(
            child: GestureDetector(
              onTap: () => context.push('/products?tag=Upcoming'),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 11),
                decoration: BoxDecoration(color: const Color(0xFFE23744), borderRadius: BorderRadius.circular(24)),
                child: const Text('View All Products', style: TextStyle(color: Colors.white, fontSize: 13.5, fontWeight: FontWeight.w600)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _UpcomingCard extends StatelessWidget {
  final Product product;
  final _Accent accent;
  final VoidCallback onTap;

  const _UpcomingCard({required this.product, required this.accent, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: accent.border),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image banner with "LAUNCHING SOON" badge
            Stack(
              children: [
                ClipRRect(
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
                  child: SizedBox(
                    height: 120,
                    width: double.infinity,
                    child: product.primaryImageUrl != null
                        ? CachedNetworkImage(
                            imageUrl: product.primaryImageUrl!,
                            fit: BoxFit.cover,
                            width: double.infinity,
                            placeholder: (_, __) => Container(color: accent.bg, child: Center(child: Icon(Icons.medication_outlined, color: accent.solid))),
                            errorWidget: (_, __, ___) => Container(color: accent.bg, child: Center(child: Icon(Icons.medication_outlined, color: accent.solid))),
                          )
                        : Container(color: accent.bg, child: Center(child: Icon(Icons.medication_outlined, color: accent.solid, size: 32))),
                  ),
                ),
                Positioned(
                  top: 8,
                  left: 8,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.92), borderRadius: BorderRadius.circular(20)),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.calendar_today_outlined, size: 10, color: accent.solid),
                        const SizedBox(width: 4),
                        Text('LAUNCHING SOON', style: TextStyle(fontSize: 8, fontWeight: FontWeight.w700, color: accent.solid, letterSpacing: 0.4)),
                      ],
                    ),
                  ),
                ),
              ],
            ),

            // Body
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 22, height: 22,
                        decoration: BoxDecoration(color: accent.bg, shape: BoxShape.circle),
                        child: Icon(Icons.medical_services_outlined, size: 12, color: accent.solid),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          product.categories.isNotEmpty ? product.categories.first : 'Pharma',
                          style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600, color: accent.solid),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(product.name,
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: _ink),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 3),
                  Text(product.description,
                      style: TextStyle(fontSize: 11, color: Colors.grey.shade600, height: 1.3),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis),
                ],
              ),
            ),

            const Spacer(),

            // Footer bar
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
              decoration: BoxDecoration(
                color: accent.bg,
                borderRadius: const BorderRadius.vertical(bottom: Radius.circular(16)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('MRP', style: TextStyle(fontSize: 8.5, color: Colors.grey.shade500, fontWeight: FontWeight.w600)),
                        Text(
                          product.mrp != null ? 'Rs. ${product.mrp!.toStringAsFixed(2)}' : '—',
                          style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: accent.solid),
                        ),
                      ],
                    ),
                  ),
                  if (product.packSize != null && product.packSize!.isNotEmpty)
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Packing', style: TextStyle(fontSize: 8.5, color: Colors.grey.shade500, fontWeight: FontWeight.w600)),
                          Text(product.packSize!, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: _ink), maxLines: 1, overflow: TextOverflow.ellipsis),
                        ],
                      ),
                    ),
                  Container(
                    width: 26, height: 26,
                    decoration: BoxDecoration(color: accent.solid, shape: BoxShape.circle),
                    child: const Icon(Icons.arrow_forward, color: Colors.white, size: 14),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
