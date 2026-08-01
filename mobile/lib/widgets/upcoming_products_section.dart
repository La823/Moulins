import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../models/product.dart';
import '../providers/auth_provider.dart';
import '../providers/cart_provider.dart';
import '../services/product_service.dart';
import 'product_card.dart';

const _ink = Color(0xFF1A1A1A);
const _teal = Color(0xFF00A6A4);

// Any product tagged "Upcoming" in admin — mirrors the website homepage's
// "Upcoming Products" row.
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

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Upcoming Products', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w400, color: _ink)),
              GestureDetector(
                onTap: () => context.push('/products?tag=Upcoming'),
                child: const Text('View All', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _teal)),
              ),
            ],
          ),
          const SizedBox(height: 14),
          SizedBox(
            height: 240,
            child: ScrollConfiguration(
              behavior: ScrollConfiguration.of(context).copyWith(scrollbars: false),
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _products.length,
                separatorBuilder: (_, __) => const SizedBox(width: 12),
                itemBuilder: (context, i) {
                  final p = _products[i];
                  return SizedBox(
                    width: 160,
                    child: ProductCard(
                      product: p,
                      onTap: () => context.push('/products/${p.id}'),
                      onAddToCart: () => ref.read(cartProvider.notifier).add(p),
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
