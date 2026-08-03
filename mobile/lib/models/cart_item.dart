import 'product.dart';

class CartItem {
  final Product product;
  int quantity;

  CartItem({required this.product, int? quantity}) : quantity = quantity ?? (product.moq > 0 ? product.moq : 1);

  double get total => (product.mrp ?? product.price) * quantity;
}
