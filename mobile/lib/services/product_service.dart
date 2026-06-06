import '../config/api.dart';
import '../models/product.dart';

class ProductService {
  final _dio = createDio();

  Future<ProductListResponse> getProducts({
    int page = 1,
    int limit = 20,
    String search = '',
    String category = '',
  }) async {
    final res = await _dio.get('/products', queryParameters: {
      'page': page,
      'limit': limit,
      if (search.isNotEmpty) 'search': search,
      if (category.isNotEmpty) 'category': category,
    });
    return ProductListResponse.fromJson(res.data);
  }

  Future<Product> getProduct(String id) async {
    final res = await _dio.get('/products/$id');
    return Product.fromJson(res.data);
  }

  Future<List<String>> getCategories() async {
    final res = await _dio.get('/products/categories');
    return List<String>.from(res.data ?? []);
  }
}
