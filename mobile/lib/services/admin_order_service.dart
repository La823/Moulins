import 'dart:io';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import '../config/api.dart';
import '../models/staff_order.dart';

/// Staff order management, the same routes as the website's Orders pages:
/// orders_view to see them, orders_edit to change rates and status and to
/// send them to Marg (the server checks both).
class AdminOrderService {
  final _dio = createDio();

  Future<List<StaffOrder>> list({String status = '', String search = '', int page = 1}) async {
    final res = await _dio.get('/admin/orders', queryParameters: {
      'page': page,
      'limit': 30,
      if (status.isNotEmpty) 'status': status,
      if (search.trim().isNotEmpty) 'search': search.trim(),
    });
    return (res.data['orders'] as List<dynamic>? ?? []).map((e) => StaffOrder.fromJson(e)).toList();
  }

  Future<StaffOrder> get(String id) async {
    final res = await _dio.get('/orders/$id');
    return StaffOrder.fromJson(res.data);
  }

  /// Rates by item id (null clears one), and optionally the freight; one
  /// request for the whole order, as the website does.
  Future<void> saveRates(String id, Map<String, double?> rates, {double? freight, bool setFreight = false}) async {
    await _dio.put('/admin/orders/$id/rates', data: {
      'rates': rates.entries.map((e) => {'item_id': e.key, 'rate': e.value}).toList(),
      if (setFreight) 'freight': freight,
    });
  }

  Future<void> setStatus(String id, String status) async =>
      _dio.put('/admin/orders/$id/status', data: {'status': status});

  /// The delivery mode and, optionally, the transporter of that mode.
  Future<void> setTransport(String id, String mode, String? transportId) async =>
      _dio.put('/admin/orders/$id/transport', data: {'transport_mode': mode, 'transport_id': transportId});

  // ---- lines ----

  Future<List<LineBatchOptions>> batchOptions(String id) async {
    final res = await _dio.get('/admin/orders/$id/marg-batch-options');
    final items = res.data is Map ? res.data['items'] : res.data;
    return (items as List<dynamic>? ?? []).map((e) => LineBatchOptions.fromJson(e)).toList();
  }

  Future<void> setBatch(String id, String itemId, String code) async =>
      _dio.put('/admin/orders/$id/items/$itemId/batch', data: {'batch_code': code});

  Future<void> addItem(String id,
          {required String productId, required String productName, required int quantity}) async =>
      _dio.post('/admin/orders/$id/items',
          data: {'product_id': productId, 'product_name': productName, 'quantity': quantity});

  Future<void> setQuantity(String id, String itemId, int quantity) async =>
      _dio.put('/admin/orders/$id/items/$itemId', data: {'quantity': quantity});

  Future<void> deleteItem(String id, String itemId) async => _dio.delete('/admin/orders/$id/items/$itemId');

  // ---- photos ----

  /// Uploads a bill or tracking photo (or a bill as a PDF) and attaches it
  /// to the order.
  Future<void> addPhoto(String id, Uint8List bytes, String filename, {required String type}) async {
    final lower = filename.toLowerCase();
    final contentType = lower.endsWith('.pdf')
        ? 'application/pdf'
        : lower.endsWith('.png')
            ? 'image/png'
            : 'image/jpeg';
    final res = await _dio.post(
        type == 'tracking' ? '/admin/orders/$id/tracking-upload-url' : '/admin/orders/upload-url',
        data: {'filename': filename});
    await Dio().put(res.data['upload_url'] as String,
        data: Stream.fromIterable([bytes]),
        options: Options(headers: {'Content-Type': contentType, Headers.contentLengthHeader: bytes.length}));
    await _dio.post('/admin/orders/$id/photos', data: {'image_key': res.data['key'], 'photo_type': type});
  }

  Future<void> deletePhoto(String photoId) async => _dio.delete('/admin/orders/photos/$photoId');

  // ---- WhatsApp and PDF ----

  /// The order message for the partner and their phone number.
  Future<({String message, String phone})> whatsAppMessage(String id) async {
    final res = await _dio.get('/admin/orders/$id/whatsapp-message');
    return (message: res.data['message'] as String, phone: res.data['phone'] as String);
  }

  Future<void> markWhatsAppSent(String id, String phone) async =>
      _dio.post('/admin/orders/$id/whatsapp-sent', data: {'key': 'order_received_whatsapp', 'phone': phone});

  /// The order's PDF, freshly made, as a local file.
  Future<File> pdf(String id) async {
    final token = await getToken();
    final info = await DefaultCacheManager().downloadFile('$baseUrl/admin/orders/$id/pdf',
        key: 'order-pdf-$id', authHeaders: {'Authorization': 'Bearer $token'}, force: true);
    return info.file;
  }

  /// What this party paid for a product before (Marg bills and earlier
  /// orders, this order left out) and how its batches were bought; the
  /// line's batch code ("<marg code>-<batch>") adds that batch's purchases.
  /// Same as the website's history panel (needs orders_edit).
  Future<Map<String, dynamic>?> rateHistory(String partnerId, String productId,
      {String? excludeOrder, String? lineBatchCode}) async {
    final dash = lineBatchCode?.indexOf('-') ?? -1;
    final batch = dash > 0 ? lineBatchCode!.substring(dash + 1) : null;
    final res = await _dio.get('/admin/partners/$partnerId/rate-history', queryParameters: {
      'products': productId,
      if (excludeOrder != null) 'exclude_order': excludeOrder,
      if (batch != null && batch.isNotEmpty) 'batches': '$productId:$batch',
    });
    final products = res.data is Map ? res.data['products'] : null;
    return products is Map ? (products[productId] as Map?)?.cast<String, dynamic>() : null;
  }

  /// The most recent sale lines of a product to any party (Marg bills,
  /// newest first).
  Future<List<Map<String, dynamic>>> recentSales(String productId) async {
    // without a partner the route always answers with the latest sales to anyone
    final res = await _dio.get('/admin/orders/product-rates/$productId');
    final recent = res.data is Map ? res.data['recent'] : null;
    return (recent as List? ?? []).cast<Map>().map((e) => e.cast<String, dynamic>()).toList();
  }

  /// Sends the order's unsent lines to Marg; returns the Marg order number.
  Future<String?> sendToMarg(String id) async {
    final res = await _dio.post('/admin/orders/$id/push-to-marg');
    return res.data is Map ? res.data['marg_order_no']?.toString() : null;
  }
}
