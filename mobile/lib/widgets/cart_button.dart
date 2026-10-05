import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/cart_provider.dart';

/// Top-right cart icon with an item-count badge, matching
/// [NotificationBellButton] so the app bar reads consistently.
///
/// Opens the side cart ([CartDrawer]) when the surrounding Scaffold has an
/// endDrawer, and falls back to pushing /cart when it does not — so the
/// button can be dropped into any app bar without knowing what is around it.
class CartButton extends ConsumerWidget {
  const CartButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count = ref.watch(cartProvider.notifier).itemCount;

    return Stack(
      clipBehavior: Clip.none,
      children: [
        IconButton(
          icon: const Icon(Icons.shopping_bag_outlined, color: Color(0xFF1A1A1A)),
          tooltip: 'Cart',
          onPressed: () {
            final scaffold = Scaffold.maybeOf(context);
            if (scaffold?.hasEndDrawer ?? false) {
              scaffold!.openEndDrawer();
            } else {
              context.push('/cart');
            }
          },
        ),
        if (count > 0)
          Positioned(
            right: 8,
            top: 8,
            child: Container(
              width: 16,
              height: 16,
              decoration: const BoxDecoration(color: Color(0xFF00A6A4), shape: BoxShape.circle),
              child: Center(
                child: Text(
                  count > 9 ? '9+' : '$count',
                  style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
