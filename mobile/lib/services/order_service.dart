import '../config/api.dart';
import 'json_cache.dart';
import '../models/order.dart';
import '../models/cart_item.dart';

class OrderService {
  final _dio = createDio();

  // Orders are remembered on the phone each time they load, and shown from
  // there with no internet (json_cache.dart).
  Future<List<Order>> getMyOrders() async {
    return JsonCache.fetch(
      'orders_mine',
      () async => (await _dio.get('/orders')).data,
      (data) => data is List ? data.map((e) => Order.fromJson(e)).toList() : <Order>[],
    );
  }

  Future<Order> getOrder(String id) async {
    return JsonCache.fetch(
      'order_$id',
      () async => (await _dio.get('/orders/$id')).data,
      (data) => Order.fromJson(data as Map<String, dynamic>),
    );
  }

  Future<String> placeOrder(List<CartItem> items, {String? transportMode, String? transportId}) async {
    final res = await _dio.post('/orders', data: {
      'items': items
          .map((e) => {
                'product_id': e.product.id,
                'product_name': e.product.name,
                'quantity': e.quantity,
              })
          .toList(),
      if (transportMode != null) 'transport_mode': transportMode,
      if (transportId != null) 'transport_id': transportId,
    });
    // backend returns { "order_id": "uuid" }
    return res.data['order_id'] ?? res.data['id'] ?? '';
  }

  // Staff (admin/employee) see every order that comes in, not just their
  // own — there's no self-service "my orders" concept for them.
  Future<List<Order>> getAllOrders({int page = 1, int limit = 50}) async {
    final res = await _dio.get('/admin/orders', queryParameters: {'page': page, 'limit': limit});
    final list = res.data['orders'] as List<dynamic>? ?? [];
    return list.map((e) => Order.fromJson(e)).toList();
  }

  Future<Map<String, String>> getPhotoUploadUrl(String filename) async {
    final res = await _dio.post('/admin/orders/upload-url', data: {'filename': filename});
    return {'upload_url': res.data['upload_url'], 'key': res.data['key']};
  }

  Future<Map<String, String>> getTrackingUploadUrl(String orderId, String filename) async {
    final res = await _dio.post('/admin/orders/$orderId/tracking-upload-url', data: {'filename': filename});
    return {'upload_url': res.data['upload_url'], 'key': res.data['key']};
  }

  Future<void> addOrderPhoto(String orderId, String imageKey, {String photoType = 'bill'}) async {
    await _dio.post('/admin/orders/$orderId/photos', data: {'image_key': imageKey, 'photo_type': photoType});
  }

  Future<void> deleteOrderPhoto(String photoId) async {
    await _dio.delete('/admin/orders/photos/$photoId');
  }

  Future<void> updateStatus(String orderId, String status) async {
    await _dio.put('/admin/orders/$orderId/status', data: {'status': status});
  }

  Future<void> updateItemQuantity(String orderId, String itemId, int quantity) async {
    await _dio.put('/admin/orders/$orderId/items/$itemId', data: {'quantity': quantity});
  }

  Future<void> deleteItem(String orderId, String itemId) async {
    await _dio.delete('/admin/orders/$orderId/items/$itemId');
  }
}
