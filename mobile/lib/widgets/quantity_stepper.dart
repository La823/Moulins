import 'package:flutter/material.dart';

const _teal = Color(0xFF00A6A4);

// The +/- quantity control shown once a product is already in the cart —
// used on product detail screens (and mirrored, in compact circular form,
// on ProductCard) so quantity can be adjusted without opening the cart.
class QuantityStepper extends StatelessWidget {
  final int quantity;
  final int step;
  final VoidCallback onDecrement;
  final VoidCallback onIncrement;

  const QuantityStepper({
    super.key,
    required this.quantity,
    required this.step,
    required this.onDecrement,
    required this.onIncrement,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(border: Border.all(color: Colors.grey.shade300), borderRadius: BorderRadius.circular(10)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            onPressed: onDecrement,
            icon: const Icon(Icons.remove, color: _teal, size: 18),
            constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
            padding: EdgeInsets.zero,
          ),
          SizedBox(
            width: 32,
            child: Text('$quantity', textAlign: TextAlign.center, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFF1A1A1A))),
          ),
          IconButton(
            onPressed: onIncrement,
            icon: const Icon(Icons.add, color: _teal, size: 18),
            constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
            padding: EdgeInsets.zero,
          ),
        ],
      ),
    );
  }
}
