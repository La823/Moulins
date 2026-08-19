import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../models/product.dart';
import '../../providers/cart_provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/special_product_service.dart';
import '../../widgets/notification_bell_button.dart';
import '../../widgets/chat_button.dart';
import '../../widgets/product_card.dart';
import '../../widgets/profile_button.dart';
import '../../utils/responsive.dart';

final _specialProductService = SpecialProductService();

/// The "Special" division — a private catalog visible only to special-type
/// customers. Products here are not Moulins products and have no categories,
/// so this is a plain product grid (no division filter bar).
class SpecialProductsScreen extends ConsumerStatefulWidget {
  const SpecialProductsScreen({super.key});

  @override
  ConsumerState<SpecialProductsScreen> createState() => _SpecialProductsScreenState();
}

class _SpecialProductsScreenState extends ConsumerState<SpecialProductsScreen> {
  final List<Product> _products = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final products = await _specialProductService.getMySpecialProducts();
      if (mounted) setState(() { _products.addAll(products); _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cart = ref.watch(cartProvider);
    final canOrder = ref.watch(authProvider).user?.role != 'doctor';

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('13 Alpha Unit', style: TextStyle(color: Color(0xFF1A1A1A), fontWeight: FontWeight.w600)),
        actions: [
          if (canOrder)
            Stack(
              children: [
                IconButton(
                  icon: const Icon(Icons.shopping_bag_outlined, color: Color(0xFF1A1A1A)),
                  onPressed: () => context.push('/cart'),
                ),
                if (cart.isNotEmpty)
                  Positioned(
                    right: 8, top: 8,
                    child: Container(
                      width: 16, height: 16,
                      decoration: const BoxDecoration(color: Color(0xFF00A6A4), shape: BoxShape.circle),
                      child: Center(
                        child: Text('${cart.length}', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                      ),
                    ),
                  ),
              ],
            ),
          const ChatButton(),
          const NotificationBellButton(),
          const ProfileButton(),
          const SizedBox(width: 4),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF00A6A4)))
          : _products.isEmpty
              ? const Center(child: Text('No products available yet', style: TextStyle(color: Colors.grey)))
              : CustomScrollView(
                  slivers: [
                    SliverPadding(
                      padding: const EdgeInsets.all(16),
                      sliver: SliverGrid(
                        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: responsiveGridColumns(context),
                          childAspectRatio: 0.72,
                          crossAxisSpacing: 12,
                          mainAxisSpacing: 12,
                        ),
                        delegate: SliverChildBuilderDelegate(
                          (ctx, i) => ProductCard(
                            product: _products[i],
                            onTap: () => context.push('/special/${_products[i].id}'),
                            onAddToCart: () => ref.read(cartProvider.notifier).add(_products[i]),
                          ),
                          childCount: _products.length,
                        ),
                      ),
                    ),
                  ],
                ),
    );
  }
}
