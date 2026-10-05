import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/cart_provider.dart';
import 'quantity_stepper.dart';

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
                      padding: const EdgeInsets.fromLTRB(16, 10, 8, 10),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // Flexible, because product names here run long
                              // ("NEBSMOL-G RESPULES 4*5*2 ML") and would
                              // otherwise overflow the narrower drawer.
                              Expanded(
                                child: Text(
                                  item.product.name,
                                  style: const TextStyle(
                                      fontSize: 14, fontWeight: FontWeight.w500, color: Color(0xFF1A1A1A)),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              IconButton(
                                icon: Icon(Icons.close, size: 16, color: Colors.grey.shade400),
                                tooltip: 'Remove',
                                onPressed: () => cart.remove(item.product.id),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Row(
                            children: [
                              QuantityStepper(
                                quantity: item.quantity,
                                step: step,
                                onDecrement: () => cart.updateQty(item.product.id, item.quantity - step),
                                onIncrement: () => cart.updateQty(item.product.id, item.quantity + step),
                              ),
                              const Spacer(),
                              Text(
                                '₹${item.total.toStringAsFixed(2)}',
                                style: const TextStyle(
                                    fontSize: 14, fontWeight: FontWeight.w600, color: Color(0xFF1A1A1A)),
                              ),
                            ],
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
