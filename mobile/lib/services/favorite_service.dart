import '../config/api.dart';
import '../models/product.dart';
import 'offline_cache.dart';
import 'offline_files.dart';
import 'offline_sync.dart';

class FavoriteService {
  final _dio = createDio();

  /// Whether the last getFavorites answer was the saved copy (no internet).
  static bool lastFromCache = false;

  Future<List<Product>> getFavorites() async {
    try {
      final res = await _dio.get('/favorites');
      final products = (res.data as List<dynamic>).map((e) => Product.fromJson(e)).toList();
      await OfflineCache.saveFavorites(products);
      lastFromCache = false;
      // images, documents and audio too, in the background (Smart sync)
      if (OfflineSync.smartNow) OfflineFiles.saveProducts(products);
      return products;
    } catch (e) {
      final cached = await OfflineCache.loadFavorites();
      if (cached.isNotEmpty) {
        lastFromCache = true;
        return cached;
      }
      rethrow;
    }
  }

  Future<List<String>> getFavoriteIds() async {
    try {
      final res = await _dio.get('/favorites/ids');
      return List<String>.from(res.data as List<dynamic>);
    } catch (_) {
      return OfflineCache.loadFavoriteIds();
    }
  }

  Future<void> addFavorite(Product product) async {
    await OfflineCache.addFavoriteLocally(product);
    await _dio.post('/favorites/${product.id}');
  }

  Future<void> removeFavorite(String productId) async {
    await OfflineCache.removeFavoriteLocally(productId);
    await _dio.delete('/favorites/$productId');
  }
}
