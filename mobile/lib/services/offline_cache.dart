import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/product.dart';
import 'offline_owner.dart';

/// Lightweight local fallback for browsing products with no connection.
/// Keeps only what's needed to not dead-end the UI offline: the last
/// successfully fetched default product list, and every individual product
/// page the user has actually opened while online. Kept per account
/// (offline_owner.dart).
class OfflineCache {
  static String get _listKey => OfflineOwner.key('cached_product_list');
  static String _productKey(String id) => OfflineOwner.key('cached_product_$id');
  static String get _favoritesKey => OfflineOwner.key('cached_favorite_products');
  static String get _favoriteIdsKey => OfflineOwner.key('cached_favorite_ids');

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
    await prefs.setString(_productKey(product.id), jsonEncode(product.toJson()));
    _all = null;
  }

  static Future<void> removeProduct(String id) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_productKey(id));
    _all = null;
  }

  /// Every product page this account has saved (opened, listed, favourited
  /// or saved with "Save everything"): the catalogue offline search uses.
  // read once and kept, as offline search runs on every key press; cleared
  // when a product is saved or removed, or the account changes
  static List<Product>? _all;
  static String? _allOwner;

  /// Reads the saved products again next time (e.g. the background job
  /// saved more while the app was away).
  static void forgetLoaded() => _all = null;

  static Future<List<Product>> loadAllProducts() async {
    if (_all != null && _allOwner == OfflineOwner.id) return _all!;
    final prefs = await SharedPreferences.getInstance();
    final out = <Product>[];
    for (final k in prefs.getKeys()) {
      if (!k.startsWith('cached_product_') || k.startsWith('cached_product_list') || !OfflineOwner.owns(k)) continue;
      try {
        out.add(Product.fromJson(jsonDecode(prefs.getString(k) ?? '')));
      } catch (_) {}
    }
    _all = out;
    _allOwner = OfflineOwner.id;
    return out;
  }

  static Future<Product?> loadProduct(String id) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_productKey(id));
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
