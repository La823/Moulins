import 'package:flutter/material.dart';

/// The product's warehouse inventory code (products.inventory_code), shown as
/// a small monospace tag beside an order line, as the printed order sheet
/// does, so a packer can find the rack. Nothing when the product has none.
class InventoryCodeTag extends StatelessWidget {
  final String? code;
  const InventoryCodeTag(this.code, {super.key});

  @override
  Widget build(BuildContext context) {
    final c = code?.trim() ?? '';
    if (c.isEmpty) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.only(top: 3),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: const Color(0xFFEEF2FF),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: const Color(0xFFC7D2FE)),
      ),
      child: Text(
        c,
        style: const TextStyle(
          fontFamily: 'monospace',
          fontSize: 11.5,
          fontWeight: FontWeight.w700,
          color: Color(0xFF3730A3),
          letterSpacing: 0.3,
        ),
      ),
    );
  }
}

/// A product name with its inventory code tag underneath.
class ProductNameWithCode extends StatelessWidget {
  final String name;
  final String? code;
  final TextStyle? style;
  const ProductNameWithCode(this.name, this.code, {super.key, this.style});

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
      Text(name, style: style),
      InventoryCodeTag(code),
    ]);
  }
}
