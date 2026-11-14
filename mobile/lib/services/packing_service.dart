import 'dart:typed_data';
import 'package:dio/dio.dart';
import '../config/api.dart';

/// Packing (backend internal/packing): confirmed orders packed one product
/// at a time — a photo of each product's batch, read by AI on the server and
/// checked against the order, then a tick; with every product ticked the
/// order becomes Packed. Needs the packing_edit permission (admins always).

DateTime? _date(dynamic v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;

class PackingListRow {
  final String id;
  final String status;
  final DateTime? createdAt;
  final String customer;
  final String city;
  final int items;
  final int ticked;
  final bool started;
  final DateTime? packedAt;
  final String packedBy;

  PackingListRow.fromJson(Map<String, dynamic> j)
      : id = j['id'] ?? '',
        status = j['status'] ?? '',
        createdAt = _date(j['created_at']),
        customer = j['customer'] ?? '',
        city = j['city'] ?? '',
        items = j['items'] ?? 0,
        ticked = j['ticked'] ?? 0,
        started = j['started'] == true,
        packedAt = _date(j['packed_at']),
        packedBy = j['packed_by'] ?? '';
}

class PackingItem {
  final String id;
  final String productName;
  final int quantity;
  final bool margLinked;
  final String expectedBatch;
  final String expectedExpiry;
  final int knownBatches;
  final String photoUrl;
  final String readBatch;
  final String readExpiry;
  final String readSource;
  final String result; // match, mismatch, unreadable, unchecked; '' = not checked
  final String resultNote;
  final String checkedBy;
  final String overrideBy;
  final String overrideReason;
  final bool overridden;
  final bool packed;
  final String packedBy;
  final DateTime? packedAt;
  final bool qtyChanged;
  final bool canTick;

  PackingItem.fromJson(Map<String, dynamic> j)
      : id = j['order_item_id'] ?? '',
        productName = j['product_name'] ?? '',
        quantity = j['quantity'] ?? 0,
        margLinked = j['marg_linked'] == true,
        expectedBatch = j['expected_batch'] ?? '',
        expectedExpiry = j['expected_expiry'] ?? '',
        knownBatches = j['known_batches'] ?? 0,
        photoUrl = j['photo_url'] ?? '',
        readBatch = j['read_batch'] ?? '',
        readExpiry = j['read_expiry'] ?? '',
        readSource = j['read_source'] ?? '',
        result = j['result'] ?? '',
        resultNote = j['result_note'] ?? '',
        checkedBy = j['checked_by'] ?? '',
        overrideBy = j['override_by'] ?? '',
        overrideReason = j['override_reason'] ?? '',
        overridden = j['override_at'] != null,
        packed = j['packed'] == true,
        packedBy = j['packed_by'] ?? '',
        packedAt = _date(j['packed_at']),
        qtyChanged = j['qty_changed'] == true,
        canTick = j['can_tick'] == true;
}

class PackingLogEntry {
  final DateTime? at;
  final String user;
  final String action;
  final String product;
  final String detail;
  final String photoUrl;

  PackingLogEntry.fromJson(Map<String, dynamic> j)
      : at = _date(j['at']),
        user = j['user'] ?? '',
        action = j['action'] ?? '',
        product = j['product'] ?? '',
        detail = j['detail'] ?? '',
        photoUrl = j['photo_url'] ?? '';
}

class PackingOrder {
  final String id;
  final String status;
  final DateTime? createdAt;
  final String customer;
  final String phone;
  final String city;
  final String transportMode;
  final String transportName;
  final String notes;
  final String margOrderNo;
  final DateTime? packedAt;
  final String packedBy;
  final List<PackingItem> items;
  final int ticked;
  final bool canFinish;
  final List<PackingLogEntry> log;

  PackingOrder.fromJson(Map<String, dynamic> j)
      : id = j['id'] ?? '',
        status = j['status'] ?? '',
        createdAt = _date(j['created_at']),
        customer = j['customer'] ?? '',
        phone = j['phone'] ?? '',
        city = j['city'] ?? '',
        transportMode = j['transport_mode'] ?? '',
        transportName = j['transport_name'] ?? '',
        notes = j['notes'] ?? '',
        margOrderNo = j['marg_order_no'] ?? '',
        packedAt = _date(j['packed_at']),
        packedBy = j['packed_by'] ?? '',
        items = (j['items'] as List<dynamic>? ?? []).map((e) => PackingItem.fromJson(e)).toList(),
        ticked = j['ticked'] ?? 0,
        canFinish = j['can_finish'] == true,
        log = (j['log'] as List<dynamic>? ?? []).map((e) => PackingLogEntry.fromJson(e)).toList();
}

/// What a batch photo (or a typed batch) came to.
class PackingCheck {
  final String result;
  final String note;
  final String readBatch;
  final String readExpiry;
  final String readProduct;
  final String expectedBatch;

  PackingCheck.fromJson(Map<String, dynamic> j)
      : result = j['result'] ?? '',
        note = j['note'] ?? '',
        readBatch = j['read_batch'] ?? '',
        readExpiry = j['read_expiry'] ?? '',
        readProduct = j['read_product'] ?? '',
        expectedBatch = j['expected_batch'] ?? '';

  bool get ok => result == 'match' || result == 'unchecked';
}

class PackingService {
  final _dio = createDio();

  Future<List<PackingListRow>> list({bool packed = false}) async {
    final res = await _dio.get('/admin/packing/orders', queryParameters: {'view': packed ? 'packed' : 'to_pack'});
    return (res.data['orders'] as List<dynamic>? ?? []).map((e) => PackingListRow.fromJson(e)).toList();
  }

  Future<PackingOrder> get(String id) async {
    final res = await _dio.get('/admin/packing/orders/$id');
    return PackingOrder.fromJson(res.data);
  }

  /// Sends the batch photo; the server reads it (a few seconds) and answers.
  Future<PackingCheck> sendPhoto(String orderId, String itemId, Uint8List bytes, String filename) async {
    final form = FormData.fromMap({'photo': MultipartFile.fromBytes(bytes, filename: filename)});
    final res = await _dio.post('/admin/packing/orders/$orderId/items/$itemId/photo',
        data: form,
        options: Options(contentType: 'multipart/form-data', receiveTimeout: const Duration(seconds: 90), sendTimeout: const Duration(seconds: 60)));
    return PackingCheck.fromJson(res.data);
  }

  Future<PackingCheck> typeBatch(String orderId, String itemId, String batch, {String expiry = ''}) async {
    final res = await _dio.post('/admin/packing/orders/$orderId/items/$itemId/typed', data: {'batch': batch, 'expiry': expiry});
    return PackingCheck.fromJson(res.data);
  }

  Future<void> setPacked(String orderId, String itemId, bool packed) async =>
      _dio.put('/admin/packing/orders/$orderId/items/$itemId/packed', data: {'packed': packed});

  Future<void> allow(String orderId, String itemId, String reason) async =>
      _dio.post('/admin/packing/orders/$orderId/items/$itemId/override', data: {'reason': reason});

  Future<void> finish(String orderId) async => _dio.post('/admin/packing/orders/$orderId/finish');

  Future<void> reopen(String orderId, String reason) async =>
      _dio.post('/admin/packing/orders/$orderId/reopen', data: {'reason': reason});
}
