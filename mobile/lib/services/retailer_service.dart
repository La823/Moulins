import 'package:dio/dio.dart';
import '../config/api.dart';
import '../models/cart_item.dart';
import '../models/retailer.dart';

/// Retailers: the partner manages them and handles their orders; a retailer
/// places and follows their own orders (backend: routehandlers/retailers).
class RetailerService {
  final _dio = createDio();

  /// The server's reason for a refusal, or a fallback, for showing to people.
  static String messageOf(Object e, {String fallback = 'This could not be completed. Please try again.'}) {
    if (e is DioException) {
      if (e.response == null) return 'Unable to reach the server. Please check your internet connection and try again.';
      final data = e.response!.data;
      if (data is String && data.trim().isNotEmpty && !data.contains('<')) return data.trim();
    }
    return fallback;
  }

  // ---- partner: retailers ----

  Future<List<Retailer>> getRetailers() async {
    final res = await _dio.get('/retailers');
    return (res.data as List<dynamic>).map((e) => Retailer.fromJson(e)).toList();
  }

  Future<void> addRetailer(
      {required String name, required String phone, String? shopName, String? address, String? city}) async {
    await _dio.post('/retailers', data: {
      'name': name,
      'phone': phone,
      'shop_name': shopName,
      'address': address,
      'city': city,
    });
  }

  Future<void> updateRetailer(String id,
      {required String name, String? shopName, String? address, String? city}) async {
    await _dio.put('/retailers/$id', data: {'name': name, 'shop_name': shopName, 'address': address, 'city': city});
  }

  Future<void> removeRetailer(String id) async => _dio.delete('/retailers/$id');

  Future<void> resetPassword(String id) async => _dio.post('/retailers/$id/reset-password');

  // ---- orders ----

  /// Partner: orders from their retailers. Retailer: their own.
  Future<List<RetailerOrder>> getOrders({required bool incoming, String? status}) async {
    final res = await _dio.get(incoming ? '/retailer-orders/incoming' : '/retailer-orders',
        queryParameters: {if (status != null && status.isNotEmpty) 'status': status});
    return (res.data as List<dynamic>).map((e) => RetailerOrder.fromJson(e)).toList();
  }

  Future<RetailerOrder> getOrder(String id) async {
    final res = await _dio.get('/retailer-orders/$id');
    return RetailerOrder.fromJson(res.data);
  }

  /// Retailer: orders the cart from their partner; returns the new order's id.
  Future<String> placeOrder(List<CartItem> items, {String? notes}) async {
    final res = await _dio.post('/retailer-orders', data: {
      'items': items.map((i) => {'product_id': i.product.id, 'quantity': i.quantity}).toList(),
      if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
    });
    return res.data['id'] as String;
  }

  Future<void> cancel(String id) async => _dio.put('/retailer-orders/$id/cancel');

  /// Partner: accept with a rate for every line (item id -> rate).
  Future<void> accept(String id, Map<String, double> rates, {String? note}) async {
    await _dio.put('/retailer-orders/$id/accept', data: {'rates': rates, 'note': note ?? ''});
  }

  Future<void> reject(String id, String reason) async =>
      _dio.put('/retailer-orders/$id/reject', data: {'note': reason});

  Future<void> dispatch(String id, {String? note}) async =>
      _dio.put('/retailer-orders/$id/dispatch', data: {'note': note ?? ''});

  Future<void> deliver(String id, {String? note}) async =>
      _dio.put('/retailer-orders/$id/deliver', data: {'note': note ?? ''});

  /// Partner: sends the order's products to Moulins as their own order;
  /// returns that order's id.
  Future<String> forward(String id) async {
    final res = await _dio.post('/retailer-orders/$id/forward');
    return res.data['order_id'] as String;
  }
}
