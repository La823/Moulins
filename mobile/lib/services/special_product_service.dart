import '../config/api.dart';
import '../models/product.dart';

/// Talks to the customer-facing special-products endpoints. The server scopes
/// every response to the authenticated requester's own id and 403s anyone who
/// isn't a special-type customer, so there's no customer id to pass here.
///
/// Special products share the same JSON shape as regular products (minus
/// categories), so they reuse the [Product] model.
class SpecialProductService {
  final _dio = createDio();

  Future<List<Product>> getMySpecialProducts() async {
    final res = await _dio.get('/special-products');
    final list = res.data as List<dynamic>? ?? [];
    return list.map((e) => Product.fromJson(e)).toList();
  }

  Future<Product> getSpecialProduct(String id) async {
    final res = await _dio.get('/special-products/$id');
    return Product.fromJson(res.data);
  }
}
