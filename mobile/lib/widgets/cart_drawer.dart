import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/cart_provider.dart';
import 'product_thumbnail.dart';

/// Side cart, opened from [CartButton]. Shows what is in the cart and lets
/// quantities be adjusted without leaving the current screen; checkout still
/// happens on the full /cart screen, which owns transport and address.
///
/// Quantities step by the product's MOQ, matching the cart screen and the
/// product card — stepping by 1 would let someone build an order the backend
/// then rejects.
class CartDrawer extends ConsumerWidget {
  const CartDrawer({super.key});

  static const _teal = Color(0xFF00A6A4);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(cartProvider);
    final cart = ref.read(cartProvider.notifier);

    return Drawer(
      width: MediaQuery.of(context).size.width * 0.86,
      backgroundColor: Colors.white,
      child: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 8, 12),
              child: Row(
                children: [
                  const Icon(Icons.shopping_bag_outlined, color: Color(0xFF1A1A1A), size: 20),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Cart (${items.length})',
                      style: const TextStyle(
                          fontSize: 17, fontWeight: FontWeight.w600, color: Color(0xFF1A1A1A)),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, color: Color(0xFF1A1A1A)),
                    tooltip: 'Close',
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),

            if (items.isEmpty)
              Expanded(
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.shopping_bag_outlined, size: 56, color: Colors.grey.shade300),
                      const SizedBox(height: 12),
                      const Text('Your cart is empty',
                          style: TextStyle(color: Colors.grey, fontSize: 15)),
                    ],
                  ),
                ),
              )
            else
              Expanded(
                child: ListView.separated(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  itemCount: items.length,
                  separatorBuilder: (_, __) => const Divider(height: 1, indent: 16, endIndent: 16),
                  itemBuilder: (context, i) {
                    final item = items[i];
                    final step = item.product.moq > 0 ? item.product.moq : 1;
                    return Padding(
                      padding: const EdgeInsets.fromLTRB(16, 10, 10, 10),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          ProductThumbnail(product: item.product, size: 44),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                // One line: the drawer is narrow and a wrapped
                                // name pushes the row's height around, which
                                // makes the list look ragged.
                                Text(
                                  item.product.name,
                                  style: const TextStyle(
                                      fontSize: 12.5,
                                      fontWeight: FontWeight.w600,
                                      color: Color(0xFF1A1A1A),
                                      height: 1.2),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 6),
                                Row(
                                  children: [
                                    _MiniStepper(
                                      quantity: item.quantity,
                                      onDecrement: () =>
                                          cart.updateQty(item.product.id, item.quantity - step),
                                      onIncrement: () =>
                                          cart.updateQty(item.product.id, item.quantity + step),
                                    ),
                                    const Spacer(),
                                    Text(
                                      '₹${item.total.toStringAsFixed(2)}',
                                      style: const TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w700,
                                          color: Color(0xFF1A1A1A)),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          IconButton(
                            icon: Icon(Icons.close, size: 15, color: Colors.grey.shade400),
                            tooltip: 'Remove',
                            visualDensity: VisualDensity.compact,
                            constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                            padding: EdgeInsets.zero,
                            onPressed: () => cart.remove(item.product.id),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),

            if (items.isNotEmpty) ...[
              const Divider(height: 1),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 14, 20, 16),
                child: Column(
                  children: [
                    Row(
                      children: [
                        const Text('Total',
                            style: TextStyle(fontSize: 14, color: Colors.grey)),
                        const Spacer(),
                        Text(
                          '₹${cart.total.toStringAsFixed(2)}',
                          style: const TextStyle(
                              fontSize: 18, fontWeight: FontWeight.w700, color: Color(0xFF1A1A1A)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: _teal,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        // Transport and address live on the full cart screen,
                        // so checkout goes there rather than being duplicated
                        // in a panel this narrow.
                        onPressed: () {
                          Navigator.of(context).pop();
                          context.push('/cart');
                        },
                        child: const Text('Go to Cart',
                            style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// A smaller [QuantityStepper] for the side cart, where the full-size control
/// would crowd a 44px row. Same teal, same behaviour, roughly two-thirds the
/// height.
class _MiniStepper extends StatelessWidget {
  final int quantity;
  final VoidCallback onDecrement;
  final VoidCallback onIncrement;

  const _MiniStepper({
    required this.quantity,
    required this.onDecrement,
    required this.onIncrement,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _btn(Icons.remove, onDecrement),
          SizedBox(
            width: 30,
            child: Text(
              '$quantity',
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontSize: 12.5, fontWeight: FontWeight.w700, color: Color(0xFF1A1A1A)),
            ),
          ),
          _btn(Icons.add, onIncrement),
        ],
      ),
    );
  }

  Widget _btn(IconData icon, VoidCallback onTap) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
          child: Icon(icon, size: 15, color: CartDrawer._teal),
        ),
      );
}
