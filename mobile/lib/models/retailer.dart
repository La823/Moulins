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

  Retailer({
    required this.id,
    required this.name,
    required this.phone,
    this.shopName,
    this.address,
    this.city,
    this.orderCount = 0,
    this.lastLoginAt,
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
      );
}

class RetailerOrderItem {
  final String id;
  final String productId;
  final String productName;
  final int quantity;
  final double? mrp;
  final double? rate;

  RetailerOrderItem({
    required this.id,
    required this.productId,
    required this.productName,
    required this.quantity,
    this.mrp,
    this.rate,
  });

  factory RetailerOrderItem.fromJson(Map<String, dynamic> j) => RetailerOrderItem(
        id: j['id'] ?? '',
        productId: j['product_id'] ?? '',
        productName: j['product_name'] ?? '',
        quantity: j['quantity'] ?? 0,
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

/// A retailer's order to their partner.
class RetailerOrder {
  final String id;
  final int orderNo;
  final String retailerName;
  final String retailerPhone;
  final String? shopName;
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
  String get retailerDisplay => (shopName != null && shopName!.isNotEmpty) ? shopName! : retailerName;

  factory RetailerOrder.fromJson(Map<String, dynamic> j) => RetailerOrder(
        id: j['id'] ?? '',
        orderNo: (j['order_no'] as num?)?.toInt() ?? 0,
        retailerName: j['retailer_name'] ?? '',
        retailerPhone: j['retailer_phone'] ?? '',
        shopName: j['shop_name'],
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
