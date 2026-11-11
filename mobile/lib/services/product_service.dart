import 'package:dio/dio.dart';
import '../config/api.dart';
import '../models/product.dart';
import 'json_cache.dart';
import 'offline_cache.dart';
import 'product_search.dart';

class ProductService {
  final _dio = createDio();

  Future<ProductListResponse> getProducts({
    int page = 1,
    int limit = 20,
    String search = '',
    String category = '',
    /// Preferred over [category]: a uuid survives a category being renamed.
    String categoryId = '',
    String form = '',
    String tag = '',
    bool saltOnly = false,
  }) async {
    // Only the plain first page of the whole catalogue is the offline copy.
    // A division (category_id) or type (form) page must neither overwrite it
    // nor fall back to it — either way offline would show the wrong products.
    final unfiltered = page == 1 &&
        search.isEmpty &&
        category.isEmpty &&
        categoryId.isEmpty &&
        form.isEmpty &&
        tag.isEmpty;
    try {
      final res = await _dio.get('/products', queryParameters: {
        'page': page,
        'limit': limit,
        if (search.isNotEmpty) 'search': search,
        if (search.isNotEmpty && saltOnly) 'salt_only': 'true',
        if (categoryId.isNotEmpty) 'category_id': categoryId
        else if (category.isNotEmpty) 'category': category,
        if (form.isNotEmpty) 'form': form,
        if (tag.isNotEmpty) 'tag': tag,
      });
      final result = ProductListResponse.fromJson(res.data);
      // Only the default unfiltered first page is cached as the offline
      // fallback — it's the one screen that must never dead-end offline.
      // Caching each product individually here (not just on detail-view)
      // means any product seen in the list opens offline too, not just
      // ones the user happened to tap into while still online.
      if (unfiltered) OfflineCache.saveProductList(result.products);
      for (final p in result.products) {
        OfflineCache.saveProduct(p);
      }
      return result;
    } catch (e) {
      if (unfiltered) {
        final cached = await OfflineCache.loadProductList();
        if (cached.isNotEmpty) {
          return ProductListResponse(
              products: cached,
              total: cached.length,
              page: 1,
              totalPages: 1,
              isFromCache: true);
        }
      }
      // A search, type or tag with no connection: look through the product
      // pages saved on the phone. A division by id can't be matched (saved
      // products carry category names only), so it still needs internet.
      if (!unfiltered && categoryId.isEmpty && JsonCache.isNoConnection(e)) {
        if (page > 1) {
          return ProductListResponse(products: const [], total: 0, page: page, totalPages: 1, isFromCache: true);
        }
        final r = ProductSearch.run(
            _filterSaved(await OfflineCache.loadAllProducts(), category: category, form: form, tag: tag), search,
            saltOnly: saltOnly);
        return ProductListResponse(
            products: r.products,
            total: r.products.length,
            page: 1,
            totalPages: 1,
            isFromCache: true,
            suggestions: r.suggestions);
      }
      rethrow;
    }
  }

  // the website's division-name, type and tag filters, over saved products
  static List<Product> _filterSaved(List<Product> all,
          {required String category, required String form, required String tag}) =>
      all.where((p) {
        if (category.isNotEmpty && !p.categories.any((c) => c.toLowerCase() == category.toLowerCase())) return false;
        if (form.isNotEmpty && (p.productForm ?? '').toLowerCase() != form.toLowerCase()) return false;
        if (tag.isNotEmpty && !p.tags.any((t) => t.toLowerCase() == tag.toLowerCase())) return false;
        return true;
      }).toList();

  Future<Product> getProduct(String id) async {
    try {
      final res = await _dio.get('/products/$id');
      final product = Product.fromJson(res.data);
      OfflineCache.saveProduct(product);
      return product;
    } catch (e) {
      // 404 means the product is gone or has been hidden from this partner —
      // forget the cached copy rather than keep showing it. Only a failed
      // connection falls back to the offline copy.
      if (e is DioException && e.response?.statusCode == 404) {
        OfflineCache.removeProduct(id);
        rethrow;
      }
      final cached = await OfflineCache.loadProduct(id);
      if (cached != null) return cached;
      rethrow;
    }
  }

  Future<List<String>> getCategories() async {
    final res = await _dio.get('/products/categories');
    final list = res.data as List<dynamic>? ?? [];
    return list.map((c) => c['name'] as String).toList();
  }

  Future<List<String>> getForms() async {
    final res = await _dio.get('/products/forms');
    final list = res.data as List<dynamic>? ?? [];
    return list.map((f) => f as String).toList();
  }

  // Fire-and-forget — records this product as viewed for the recently-
  // viewed queue (server caps it at the last 25).
  Future<void> recordView(String id) async {
    try {
      await _dio.post('/products/$id/view');
    } catch (_) {
      // best-effort
    }
  }

  Future<List<Product>> getRecentlyViewed() async {
    try {
      final res = await _dio.get('/recently-viewed');
      final list = res.data as List<dynamic>? ?? [];
      return list.map((e) => Product.fromJson(e)).toList();
    } catch (_) {
      return [];
    }
  }

  // Returns a short-lived, login-gated S3 download URL (Content-Disposition:
  // attachment) for a product image — same endpoint the web "Download" button
  // uses.
  Future<String> getImageDownloadUrl(String imageId) async {
    final res = await _dio.get('/products/images/$imageId/download-url');
    return res.data['download_url'] as String;
  }
}
