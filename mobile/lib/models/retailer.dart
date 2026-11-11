/// A partner's retailer (backend: models/retailerModel.go).
class Retailer {
  final String id;
  final String name;
  final String phone;
  final String? shopName;
  final String? address;
  final String? city;
  final int orderCount;
  final DateTime? lastLoginAt;
  final String? gstNumber;
  final bool gstVerified;
  final int dlCount;
  final int dlVerified;

  Retailer({
    required this.id,
    required this.name,
    required this.phone,
    this.shopName,
    this.address,
    this.city,
    this.orderCount = 0,
    this.lastLoginAt,
    this.gstNumber,
    this.gstVerified = false,
    this.dlCount = 0,
    this.dlVerified = 0,
  });

  /// The shop name when there is one, else the person's name.
  String get displayName => (shopName != null && shopName!.isNotEmpty) ? shopName! : name;

  factory Retailer.fromJson(Map<String, dynamic> j) => Retailer(
        id: j['id'] ?? '',
        name: j['name'] ?? '',
        phone: j['phone'] ?? '',
        shopName: j['shop_name'],
        address: j['address'],
        city: j['city'],
        orderCount: j['order_count'] ?? 0,
        lastLoginAt: DateTime.tryParse(j['last_login_at'] ?? ''),
        gstNumber: j['gst_number'],
        gstVerified: j['gst_verified'] == true,
        dlCount: j['dl_count'] ?? 0,
        dlVerified: j['dl_verified'] ?? 0,
      );
}

/// A retailer's GST number or drug licence, as their partner saved it.
class RetailerDocument {
  final String id;
  final String kind; // gst | dl
  final String number;
  final Map<String, dynamic>? details; // the government portal's answer when last checked
  final DateTime? verifiedAt;

  RetailerDocument({required this.id, required this.kind, required this.number, this.details, this.verifiedAt});

  factory RetailerDocument.fromJson(Map<String, dynamic> j) => RetailerDocument(
        id: j['id'] ?? '',
        kind: j['kind'] ?? '',
        number: j['number'] ?? '',
        details: j['details'] is Map ? Map<String, dynamic>.from(j['details']) : null,
        verifiedAt: DateTime.tryParse(j['verified_at'] ?? ''),
      );
}

class RetailerOrderItem {
  final String id;
  final String productId;
  final String productName;
  final int quantity;
  final String unit; // what the quantity counts: Strip, Bottle…
  final int perBox; // units in one of the partner's packs
  final double? mrp; // of one unit
  final double? rate; // the partner's, per unit

  RetailerOrderItem({
    required this.id,
    required this.productId,
    required this.productName,
    required this.quantity,
    this.unit = 'Unit',
    this.perBox = 1,
    this.mrp,
    this.rate,
  });

  /// "5 Strips", "1 Bottle".
  String get quantityLabel => '$quantity ${quantity == 1 ? unit : '${unit}s'}';

  factory RetailerOrderItem.fromJson(Map<String, dynamic> j) => RetailerOrderItem(
        id: j['id'] ?? '',
        productId: j['product_id'] ?? '',
        productName: j['product_name'] ?? '',
        quantity: j['quantity'] ?? 0,
        unit: j['unit'] ?? 'Unit',
        perBox: j['per_box'] ?? 1,
        mrp: (j['mrp'] as num?)?.toDouble(),
        rate: (j['rate'] as num?)?.toDouble(),
      );
}

class RetailerOrderEvent {
  final String event;
  final String description;
  final String actorName;
  final DateTime createdAt;

  RetailerOrderEvent(
      {required this.event, required this.description, required this.actorName, required this.createdAt});

  factory RetailerOrderEvent.fromJson(Map<String, dynamic> j) => RetailerOrderEvent(
        event: j['event'] ?? '',
        description: j['description'] ?? '',
        actorName: j['actor_name'] ?? '',
        createdAt: DateTime.tryParse(j['created_at'] ?? '') ?? DateTime.now(),
      );
}

/// A retailer's or a doctor's order to their partner.
class RetailerOrder {
  final String id;
  final int orderNo;
  final String retailerName;
  final String retailerPhone;
  final String? shopName; // a retailer's shop, or a doctor's clinic
  final String buyerKind; // retailer | doctor
  final String partnerName;
  final String status; // pending, accepted, rejected, cancelled, dispatched, delivered
  final String? notes;
  final String? partnerNote;
  final double? total;
  final String? forwardedOrderId;
  final int itemCount;
  final DateTime createdAt;
  final List<RetailerOrderItem> items;
  final List<RetailerOrderEvent> events;

  RetailerOrder({
    required this.id,
    required this.orderNo,
    required this.retailerName,
    required this.retailerPhone,
    this.shopName,
    this.buyerKind = 'retailer',
    required this.partnerName,
    required this.status,
    this.notes,
    this.partnerNote,
    this.total,
    this.forwardedOrderId,
    this.itemCount = 0,
    required this.createdAt,
    this.items = const [],
    this.events = const [],
  });

  String get number => 'RO-$orderNo';
  bool get fromDoctor => buyerKind == 'doctor';
  // a doctor by name (and clinic); a retailer by shop
  String get retailerDisplay => fromDoctor
      ? '${RegExp(r'^dr\.?\s', caseSensitive: false).hasMatch(retailerName) ? '' : 'Dr. '}$retailerName'
          '${shopName != null && shopName!.isNotEmpty ? ' · $shopName' : ''}'
      : (shopName != null && shopName!.isNotEmpty) ? shopName! : retailerName;

  factory RetailerOrder.fromJson(Map<String, dynamic> j) => RetailerOrder(
        id: j['id'] ?? '',
        orderNo: (j['order_no'] as num?)?.toInt() ?? 0,
        retailerName: j['retailer_name'] ?? '',
        retailerPhone: j['retailer_phone'] ?? '',
        shopName: j['shop_name'],
        buyerKind: j['buyer_kind'] ?? 'retailer',
        partnerName: j['partner_name'] ?? '',
        status: j['status'] ?? 'pending',
        notes: j['notes'],
        partnerNote: j['partner_note'],
        total: (j['total'] as num?)?.toDouble(),
        forwardedOrderId: j['forwarded_order_id'],
        itemCount: j['item_count'] ?? 0,
        createdAt: DateTime.tryParse(j['created_at'] ?? '') ?? DateTime.now(),
        items: (j['items'] as List<dynamic>? ?? []).map((e) => RetailerOrderItem.fromJson(e)).toList(),
        events: (j['events'] as List<dynamic>? ?? []).map((e) => RetailerOrderEvent.fromJson(e)).toList(),
      );
}

const retailerOrderStatusLabels = {
  'pending': 'Awaiting acceptance',
  'accepted': 'Accepted',
  'rejected': 'Declined',
  'cancelled': 'Cancelled',
  'dispatched': 'Dispatched',
  'delivered': 'Delivered',
};
