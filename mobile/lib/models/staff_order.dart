/// An order as staff see it (GET /orders/{id} as admin/employee, and the
/// /admin/orders list): with the party, the rates and what went to Marg.
/// Customers' own screens use order.dart, which never carries rates.
class StaffOrder {
  final String id;
  final String partnerId; // the party's user id, for their rate history
  final String status;
  final String partyName;
  final String partyPhone;
  final String? notes;
  final String transportMode;
  final String? transportName;
  final int itemCount;
  final double? freight;
  final double? itemsTotal;
  final double? orderTotal;
  final String? margOrderNo;
  final DateTime? margPushedAt;
  final DateTime createdAt;
  final List<StaffOrderItem> items;
  final List<StaffOrderPhoto> photos;

  StaffOrder({
    required this.id,
    this.partnerId = '',
    required this.status,
    required this.partyName,
    required this.partyPhone,
    this.notes,
    this.transportMode = '',
    this.transportName,
    this.itemCount = 0,
    this.freight,
    this.itemsTotal,
    this.orderTotal,
    this.margOrderNo,
    this.margPushedAt,
    required this.createdAt,
    this.items = const [],
    this.photos = const [],
  });

  /// Short reference, as on the website ("#1A2B3C4D").
  String get ref => '#${id.length >= 8 ? id.substring(0, 8).toUpperCase() : id}';

  bool get fullySentToMarg => items.isNotEmpty && items.every((i) => i.margPushedAt != null);

  static double? _num(dynamic v) => v == null ? null : (v as num).toDouble();

  factory StaffOrder.fromJson(Map<String, dynamic> j) => StaffOrder(
        id: j['id'] ?? '',
        partnerId: j['user_id'] ?? '',
        status: j['status'] ?? 'pending',
        partyName: j['user_name'] ?? '',
        partyPhone: j['user_phone'] ?? '',
        notes: j['notes'],
        transportMode: j['transport_mode'] ?? '',
        transportName: j['transport_name'],
        itemCount: j['item_count'] ?? (j['items'] as List?)?.length ?? 0,
        freight: _num(j['freight']),
        itemsTotal: _num(j['items_total']),
        orderTotal: _num(j['order_total']),
        margOrderNo: j['marg_order_no'],
        margPushedAt: DateTime.tryParse(j['marg_pushed_at'] ?? ''),
        createdAt: DateTime.tryParse(j['created_at'] ?? '') ?? DateTime.now(),
        items: (j['items'] as List<dynamic>? ?? []).map((e) => StaffOrderItem.fromJson(e)).toList(),
        photos: (j['photos'] as List<dynamic>? ?? []).map((e) => StaffOrderPhoto.fromJson(e)).toList(),
      );
}

/// A bill or tracking photo attached to an order.
class StaffOrderPhoto {
  final String id;
  final String url;
  final String type; // bill | tracking

  StaffOrderPhoto({required this.id, required this.url, required this.type});

  factory StaffOrderPhoto.fromJson(Map<String, dynamic> j) =>
      StaffOrderPhoto(id: j['id'] ?? '', url: j['image_url'] ?? '', type: j['photo_type'] ?? 'bill');
}

/// The live Marg batches a line can be sent with (GET marg-batch-options).
class BatchChoice {
  final String code;
  final String batch;
  final String expiry;
  final double stock;
  final double? mrp;

  BatchChoice({required this.code, required this.batch, required this.expiry, required this.stock, this.mrp});

  factory BatchChoice.fromJson(Map<String, dynamic> j) => BatchChoice(
        code: j['code'] ?? '',
        batch: j['curbatch'] ?? '',
        expiry: j['exp'] ?? '',
        stock: (j['stock'] as num?)?.toDouble() ?? 0,
        mrp: (j['mrp'] as num?)?.toDouble(),
      );
}

class LineBatchOptions {
  final String itemId;
  final bool margLinked;
  final List<BatchChoice> batches;
  final String? defaultCode;
  final String? selectedCode;

  LineBatchOptions(
      {required this.itemId, required this.margLinked, required this.batches, this.defaultCode, this.selectedCode});

  factory LineBatchOptions.fromJson(Map<String, dynamic> j) => LineBatchOptions(
        itemId: j['order_item_id'] ?? '',
        margLinked: j['marg_linked'] == true,
        batches: (j['batches'] as List<dynamic>? ?? []).map((e) => BatchChoice.fromJson(e)).toList(),
        defaultCode: j['default_code'],
        selectedCode: j['selected_code'],
      );
}

class StaffOrderItem {
  final String id;
  final String productId;
  final String productName;
  final int quantity;
  final double? rate;
  final double? lineTotal;
  final String? remarks;
  final String? batchCode;
  final DateTime? margPushedAt;

  StaffOrderItem({
    required this.id,
    this.productId = '',
    required this.productName,
    required this.quantity,
    this.rate,
    this.lineTotal,
    this.remarks,
    this.batchCode,
    this.margPushedAt,
  });

  factory StaffOrderItem.fromJson(Map<String, dynamic> j) => StaffOrderItem(
        id: j['id'] ?? '',
        productId: j['product_id'] ?? '',
        productName: j['product_name'] ?? '',
        quantity: j['quantity'] ?? 0,
        rate: StaffOrder._num(j['rate']),
        lineTotal: StaffOrder._num(j['line_total']),
        remarks: j['remarks'],
        batchCode: j['selected_batch_code'],
        margPushedAt: DateTime.tryParse(j['marg_pushed_at'] ?? ''),
      );
}

const staffOrderStatuses = ['pending', 'confirmed', 'transferred', 'shipped', 'delivered', 'cancelled', 'refunded'];
