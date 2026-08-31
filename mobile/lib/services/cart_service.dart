import '../config/api.dart';
import '../models/cart_item.dart';
import '../models/product.dart';

class CartService {
  final _dio = createDio();

  Future<List<CartItem>> getCart() async {
    final res = await _dio.get('/cart');
    final rows = (res.data['items'] as List<dynamic>? ?? []);
    return rows.map((row) {
      final product = Product(
        id: row['product_id'] ?? '',
        name: row['product_name'] ?? '',
        description: '',
        price: (row['price'] ?? 0).toDouble(),
        categories: const [],
        stock: row['stock'] ?? 0,
        moq: row['moq'] ?? 1,
        isActive: row['is_active'] ?? true,
        mrp: row['mrp'] == null ? null : (row['mrp'] as num).toDouble(),
        packSize: row['pack_size'],
        productForm: row['product_form'],
      );
      return CartItem(product: product, quantity: row['quantity'] ?? 1);
    }).toList();
  }

  Future<void> addItem(String productId, int quantity) async {
    await _dio.post('/cart/items', data: {
      'product_id': productId,
      'quantity': quantity,
    });
  }

  Future<void> updateQuantity(String productId, int quantity) async {
    await _dio.patch('/cart/items/$productId', data: {'quantity': quantity});
  }

  Future<void> removeItem(String productId) async {
    await _dio.delete('/cart/items/$productId');
  }

  Future<void> clear() async {
    await _dio.delete('/cart');
  }
}
