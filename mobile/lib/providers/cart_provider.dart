import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/cart_item.dart';
import '../models/product.dart';
import '../services/cart_service.dart';
import 'auth_provider.dart';

class CartNotifier extends StateNotifier<List<CartItem>> {
  CartNotifier(this._ref) : super([]);

  final Ref _ref;
  final _service = CartService();

  // Called once on app start (and again after login) — pulls the
  // authenticated user's real cart from the server. A failure (not logged
  // in yet, offline) just leaves the cart empty rather than throwing.
  Future<void> loadFromServer() async {
    try {
      state = await _service.getCart();
    } catch (_) {
      // Not authenticated yet, or offline — cart stays empty until the
      // next successful load (e.g. after login).
    }
  }

  // Doctors can browse the catalog but never order — block at the source
  // so every add-to-cart entry point across the app is covered.
  void add(Product product) {
    if (_ref.read(authProvider).user?.role == 'doctor') return;
    final step = product.moq > 0 ? product.moq : 1;
    final idx = state.indexWhere((e) => e.product.id == product.id);
    final quantity = idx >= 0 ? state[idx].quantity + step : step;

    if (idx >= 0) {
      final updated = [...state];
      updated[idx].quantity = quantity;
      state = updated;
    } else {
      state = [...state, CartItem(product: product, quantity: quantity)];
    }
    _service.addItem(product.id, quantity).catchError((_) {});
  }

  void remove(String productId) {
    state = state.where((e) => e.product.id != productId).toList();
    _service.removeItem(productId).catchError((_) {});
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
    _service.updateQuantity(productId, qty).catchError((_) {});
  }

  // Manual full clear (e.g. a "clear cart" button) — actually calls the API.
  void clear() {
    state = [];
    _service.clear().catchError((_) {});
  }

  // Local-state-only reset, no API call — for checkout, where the backend
  // already cleared cart_items transactionally as part of placing the
  // order. Calling clear() there would fire a redundant DELETE /cart that
  // could race with (or mask a bug in) that server-side clear; this just
  // brings local state in sync with what the server already did.
  void clearLocal() => state = [];

  double get total => state.fold(0, (sum, e) => sum + e.total);
  int get itemCount => state.fold(0, (sum, e) => sum + e.quantity);
}

final cartProvider = StateNotifierProvider<CartNotifier, List<CartItem>>(
  (ref) => CartNotifier(ref),
);
