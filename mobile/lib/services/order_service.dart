import '../config/api.dart';
import '../models/order.dart';
import '../models/cart_item.dart';

class OrderService {
  final _dio = createDio();

  Future<List<Order>> getMyOrders() async {
    final res = await _dio.get('/orders');
    final data = res.data;
    if (data is List) {
      return data.map((e) => Order.fromJson(e)).toList();
    }
    return [];
  }

  Future<Order> getOrder(String id) async {
    final res = await _dio.get('/orders/$id');
    return Order.fromJson(res.data);
  }

  Future<String> placeOrder(List<CartItem> items) async {
    final res = await _dio.post('/orders', data: {
      'items': items
          .map((e) => {
                'product_id': e.product.id,
                'product_name': e.product.name,
                'quantity': e.quantity,
              })
          .toList(),
    });
    // backend returns { "order_id": "uuid" }
    return res.data['order_id'] ?? res.data['id'] ?? '';
  }

  Future<Map<String, String>> getPhotoUploadUrl(String filename) async {
    final res = await _dio.post('/admin/orders/upload-url', data: {'filename': filename});
    return {'upload_url': res.data['upload_url'], 'key': res.data['key']};
  }

  Future<void> addOrderPhoto(String orderId, String imageKey) async {
    await _dio.post('/admin/orders/$orderId/photos', data: {'image_key': imageKey});
  }

  Future<void> deleteOrderPhoto(String photoId) async {
    await _dio.delete('/admin/orders/photos/$photoId');
  }
}
