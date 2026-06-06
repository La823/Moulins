import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/cart_item.dart';
import '../models/product.dart';

class CartNotifier extends StateNotifier<List<CartItem>> {
  CartNotifier() : super([]);

  void add(Product product) {
    final idx = state.indexWhere((e) => e.product.id == product.id);
    if (idx >= 0) {
      final updated = [...state];
      updated[idx].quantity++;
      state = updated;
    } else {
      state = [...state, CartItem(product: product)];
    }
  }

  void remove(String productId) {
    state = state.where((e) => e.product.id != productId).toList();
  }

  void updateQty(String productId, int qty) {
    if (qty <= 0) {
      remove(productId);
      return;
    }
    state = state.map((e) {
      if (e.product.id == productId) {
        e.quantity = qty;
      }
      return e;
    }).toList();
  }

  void clear() => state = [];

  double get total => state.fold(0, (sum, e) => sum + e.total);
  int get itemCount => state.fold(0, (sum, e) => sum + e.quantity);
}

final cartProvider = StateNotifierProvider<CartNotifier, List<CartItem>>(
  (ref) => CartNotifier(),
);
