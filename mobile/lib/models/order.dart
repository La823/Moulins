class OrderItem {
  final String id;
  final String productId;
  final String productName;
  final int quantity;

  OrderItem({
    required this.id,
    required this.productId,
    required this.productName,
    required this.quantity,
  });

  factory OrderItem.fromJson(Map<String, dynamic> json) => OrderItem(
        id: json['id'] ?? '',
        productId: json['product_id'] ?? '',
        productName: json['product_name'] ?? '',
        quantity: json['quantity'] ?? 0,
      );
}

class Order {
  final String id;
  final String status;
  final String createdAt;
  final int itemCount;
  final List<OrderItem> items;
  final String? trackingNumber;
  final String? expectedDelivery;
  final String? notes;

  Order({
    required this.id,
    required this.status,
    required this.createdAt,
    required this.itemCount,
    this.items = const [],
    this.trackingNumber,
    this.expectedDelivery,
    this.notes,
  });

  factory Order.fromJson(Map<String, dynamic> json) => Order(
        id: json['id'] ?? '',
        status: json['status'] ?? 'pending',
        createdAt: json['created_at'] is String
            ? json['created_at']
            : json['created_at']?.toString() ?? '',
        itemCount: json['item_count'] ??
            (json['items'] as List?)?.length ??
            0,
        items: (json['items'] as List<dynamic>? ?? [])
            .map((e) => OrderItem.fromJson(e))
            .toList(),
        trackingNumber: json['tracking_number'],
        expectedDelivery: json['expected_delivery'],
        notes: json['notes'],
      );

  String get statusLabel {
    switch (status) {
      case 'pending': return 'Pending';
      case 'confirmed': return 'Confirmed';
      case 'processing': return 'Processing';
      case 'shipped': return 'Shipped';
      case 'delivered': return 'Delivered';
      case 'cancelled': return 'Cancelled';
      default: return status;
    }
  }
}
