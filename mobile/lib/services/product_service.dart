import '../config/api.dart';
import '../models/product.dart';
import 'offline_cache.dart';

class ProductService {
  final _dio = createDio();

  Future<ProductListResponse> getProducts({
    int page = 1,
    int limit = 20,
    String search = '',
    String category = '',
  }) async {
    try {
      final res = await _dio.get('/products', queryParameters: {
        'page': page,
        'limit': limit,
        if (search.isNotEmpty) 'search': search,
        if (category.isNotEmpty) 'category': category,
      });
      final result = ProductListResponse.fromJson(res.data);
      // Only the default unfiltered first page is cached as the offline
      // fallback — it's the one screen that must never dead-end offline.
      // Caching each product individually here (not just on detail-view)
      // means any product seen in the list opens offline too, not just
      // ones the user happened to tap into while still online.
      if (page == 1 && search.isEmpty && category.isEmpty) {
        OfflineCache.saveProductList(result.products);
        for (final p in result.products) {
          OfflineCache.saveProduct(p);
        }
      }
      return result;
    } catch (e) {
      if (page == 1 && search.isEmpty && category.isEmpty) {
        final cached = await OfflineCache.loadProductList();
        if (cached.isNotEmpty) {
          return ProductListResponse(products: cached, total: cached.length, page: 1, totalPages: 1, isFromCache: true);
        }
      }
      rethrow;
    }
  }

  Future<Product> getProduct(String id) async {
    try {
      final res = await _dio.get('/products/$id');
      final product = Product.fromJson(res.data);
      OfflineCache.saveProduct(product);
      return product;
    } catch (e) {
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
}
