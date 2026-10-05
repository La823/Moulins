import 'product.dart';

class CartItem {
  final Product product;
  int quantity;

  CartItem({required this.product, int? quantity}) : quantity = quantity ?? (product.moq > 0 ? product.moq : 1);

  /// MRP times quantity — **not** what the partner pays, and currently
  /// unused. Orders carry no price until staff enter a rate on receipt, so
  /// showing this anywhere reads as an amount due when it is not: AEROBUD-200
  /// has an MRP of 105 against a selling price of 45.
  ///
  /// Kept because the figure is occasionally useful internally. Do not put it
  /// in front of a customer without deciding what it means.
  double get total => (product.mrp ?? product.price) * quantity;
}
