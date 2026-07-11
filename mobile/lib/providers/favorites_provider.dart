import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/product.dart';
import '../services/favorite_service.dart';

class FavoritesNotifier extends StateNotifier<Set<String>> {
  FavoritesNotifier() : super({}) {
    load();
  }

  final _service = FavoriteService();

  Future<void> load() async {
    final ids = await _service.getFavoriteIds();
    state = ids.toSet();
  }

  bool isFavorite(String productId) => state.contains(productId);

  Future<void> toggle(Product product) async {
    if (state.contains(product.id)) {
      state = {...state}..remove(product.id);
      try {
        await _service.removeFavorite(product.id);
      } catch (_) {
        state = {...state, product.id};
      }
    } else {
      state = {...state, product.id};
      try {
        await _service.addFavorite(product);
      } catch (_) {
        state = {...state}..remove(product.id);
      }
    }
  }
}

final favoritesProvider = StateNotifierProvider<FavoritesNotifier, Set<String>>(
  (ref) => FavoritesNotifier(),
);
