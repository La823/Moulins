import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/product.dart';
import '../providers/auth_provider.dart';
import '../providers/cart_provider.dart';

// Compact, image-free row for the products screen's list view — the same
// look as the website's list: composition is what stands out, the product
// name is a small blue link, everything else is quiet, and the cart button is
// a small black one. Phone: stacked. Tablet: table columns (see
// ProductListHeader for the matching header).

const _blue = Color(0xFF1D4ED8);
const _red = Color(0xFFAC2528);
const _card = Color(0xFFF3F4F6);
const _ink = Color(0xFF111827);
const _muted = Color(0xFF6B7280);

/// The salt(s) and strength, e.g. "Acotiamide 100 mg".
String _composition(Product p) => (p.keyIngredients?.trim().isNotEmpty ?? false)
    ? p.keyIngredients!.trim()
    : (p.strength?.trim() ?? '');

// Tablet column widths, shared by the header and every row
const _packW = 90.0;
const _typeW = 90.0;
const _mrpW = 84.0;
const _cartW = 104.0;

class ProductListHeader extends StatelessWidget {
  const ProductListHeader({super.key});

  @override
  Widget build(BuildContext context) {
    const style = TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600, letterSpacing: 1.4, color: Color(0xFF9CA3AF));
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: Colors.grey.shade200))),
      child: const Row(
        children: [
          Expanded(flex: 10, child: Text('PRODUCT', style: style)),
          SizedBox(width: 16),
          Expanded(flex: 13, child: Text('COMPOSITION', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600, letterSpacing: 1.4, color: Color(0xFF374151)))),
          SizedBox(width: 16),
          SizedBox(width: _packW, child: Text('PACK', style: style)),
          SizedBox(width: _typeW, child: Text('TYPE', style: style)),
          SizedBox(width: _mrpW, child: Text('MRP', style: style, textAlign: TextAlign.right)),
          SizedBox(width: _cartW),
        ],
      ),
    );
  }
}

class ProductListRow extends ConsumerWidget {
  final Product product;
  final VoidCallback onTap;
  final bool wide;

  const ProductListRow({super.key, required this.product, required this.onTap, required this.wide});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = product;
    final canOrder = ref.watch(authProvider).user?.role != 'doctor';
    final composition = _composition(p);
    final mrp = p.mrp ?? p.price;
    final mrpText = mrp > 0 ? '₹${mrp.toStringAsFixed(2)}' : '—';
    final details = [p.packSize, p.productForm].where((s) => s != null && s.isNotEmpty).join(' · ');

    final name = Text(
      p.name,
      maxLines: 2,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(fontSize: 12.5, color: wide ? _blue : _red, fontWeight: wide ? FontWeight.w400 : FontWeight.w600, height: 1.3, letterSpacing: wide ? 0 : 0.2),
    );
    final comp = Text(
      composition.isEmpty ? '—' : composition,
      maxLines: wide ? 2 : 4,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(fontSize: wide ? 14.5 : 15, fontWeight: FontWeight.w600, color: _ink, height: wide ? 1.3 : 1.4),
    );
    final cart = canOrder ? _CartControl(product: p, textOnly: !wide) : const SizedBox.shrink();

    if (!wide) {
      // Phone: each product its own light-grey card, with a gap between
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        child: Material(
          color: _card,
          borderRadius: BorderRadius.circular(12),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 6, 6),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  name,
                  const SizedBox(height: 4),
                  comp,
                  if (details.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Text(details, style: const TextStyle(fontSize: 12, color: _muted)),
                  ],
                  Padding(
                    padding: const EdgeInsets.only(top: 10, bottom: 2, right: 8),
                    child: Divider(height: 1, thickness: 1, color: Colors.grey.shade300),
                  ),
                  Row(
                    children: [
                      Text(mrp > 0 ? 'MRP $mrpText' : '', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: Color(0xFF374151))),
                      const Spacer(),
                      cart,
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(border: Border(bottom: BorderSide(color: Colors.grey.shade100))),
        child: Row(
          children: [
            Expanded(flex: 10, child: name),
            const SizedBox(width: 16),
            Expanded(flex: 13, child: comp),
            const SizedBox(width: 16),
            SizedBox(width: _packW, child: Text(p.packSize ?? '—', style: const TextStyle(fontSize: 13, color: _muted))),
            SizedBox(width: _typeW, child: Text(p.productForm ?? '—', style: const TextStyle(fontSize: 13, color: _muted))),
            SizedBox(width: _mrpW, child: Text(mrpText, textAlign: TextAlign.right, style: const TextStyle(fontSize: 13, color: Color(0xFF4B5563)))),
            SizedBox(width: _cartW, child: Align(alignment: Alignment.centerRight, child: cart)),
          ],
        ),
      ),
    );
  }
}

/// Small black "Add" button (or, on phone cards, plain "+ Add" text with no
/// background so it doesn't pull the eye); once the product is in the cart, a
/// −/+ stepper that moves by the product's MOQ (dropping below one MOQ
/// removes it).
class _CartControl extends ConsumerWidget {
  final Product product;
  final bool textOnly;
  const _CartControl({required this.product, this.textOnly = false});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(cartProvider);
    final idx = items.indexWhere((i) => i.product.id == product.id);
    final cart = ref.read(cartProvider.notifier);
    final step = product.moq > 0 ? product.moq : 1;

    if (idx < 0 && textOnly) {
      return TextButton.icon(
        onPressed: () => cart.add(product),
        icon: const Icon(Icons.add, size: 17),
        label: const Text('Add'),
        style: TextButton.styleFrom(
          foregroundColor: _ink,
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          minimumSize: const Size(0, 34),
          textStyle: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700),
        ),
      );
    }
    if (idx < 0) {
      return SizedBox(
        height: 32,
        child: ElevatedButton(
          onPressed: () => cart.add(product),
          style: ElevatedButton.styleFrom(
            backgroundColor: _ink,
            foregroundColor: Colors.white,
            elevation: 0,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(7)),
            textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
          ),
          child: const Text('Add to Cart'),
        ),
      );
    }

    final qty = items[idx].quantity;
    Widget btn(IconData icon, VoidCallback onTap) => InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(6),
          child: SizedBox(width: 30, height: 30, child: Icon(icon, size: 16, color: _ink)),
        );
    return Container(
      margin: textOnly ? const EdgeInsets.only(right: 6, top: 4, bottom: 4) : null,
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: textOnly ? Colors.transparent : Colors.grey.shade300),
        borderRadius: BorderRadius.circular(textOnly ? 18 : 7),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          btn(Icons.remove, () => cart.updateQty(product.id, qty - step)),
          SizedBox(
            width: 34,
            child: Text('$qty', textAlign: TextAlign.center, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          ),
          btn(Icons.add, () => cart.updateQty(product.id, qty + step)),
        ],
      ),
    );
  }
}
