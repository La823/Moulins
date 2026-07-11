import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/product.dart';

/// Lightweight local fallback for browsing products with no connection.
/// Keeps only what's needed to not dead-end the UI offline: the last
/// successfully fetched default product list, and every individual product
/// page the user has actually opened while online.
class OfflineCache {
  static const _listKey = 'cached_product_list';
  static const _productPrefix = 'cached_product_';
  static const _favoritesKey = 'cached_favorite_products';
  static const _favoriteIdsKey = 'cached_favorite_ids';

  static Future<void> saveProductList(List<Product> products) async {
    final prefs = await SharedPreferences.getInstance();
    final encoded = jsonEncode(products.map((p) => p.toJson()).toList());
    await prefs.setString(_listKey, encoded);
  }

  static Future<List<Product>> loadProductList() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_listKey);
    if (raw == null) return [];
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list.map((e) => Product.fromJson(e)).toList();
    } catch (_) {
      return [];
    }
  }

  static Future<void> saveProduct(Product product) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('$_productPrefix${product.id}', jsonEncode(product.toJson()));
  }

  static Future<Product?> loadProduct(String id) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('$_productPrefix$id');
    if (raw == null) return null;
    try {
      return Product.fromJson(jsonDecode(raw));
    } catch (_) {
      return null;
    }
  }

  // Favorites are cached separately from the general product cache and are
  // never evicted by browsing — once favorited, a product's full detail
  // (images/documents included) stays available offline indefinitely.
  static Future<void> saveFavorites(List<Product> products) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_favoritesKey, jsonEncode(products.map((p) => p.toJson()).toList()));
    await prefs.setStringList(_favoriteIdsKey, products.map((p) => p.id).toList());
    for (final p in products) {
      await saveProduct(p);
    }
  }

  static Future<List<Product>> loadFavorites() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_favoritesKey);
    if (raw == null) return [];
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list.map((e) => Product.fromJson(e)).toList();
    } catch (_) {
      return [];
    }
  }

  static Future<List<String>> loadFavoriteIds() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getStringList(_favoriteIdsKey) ?? [];
  }

  static Future<void> addFavoriteLocally(Product product) async {
    final current = await loadFavorites();
    if (current.any((p) => p.id == product.id)) return;
    await saveFavorites([...current, product]);
  }

  static Future<void> removeFavoriteLocally(String productId) async {
    final current = await loadFavorites();
    await saveFavorites(current.where((p) => p.id != productId).toList());
  }
}
