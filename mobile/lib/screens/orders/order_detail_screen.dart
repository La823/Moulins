import 'package:flutter/material.dart';
import '../../models/order.dart';
import '../../services/order_service.dart';
import 'package:intl/intl.dart';

class OrderDetailScreen extends StatefulWidget {
  final String orderId;
  const OrderDetailScreen({super.key, required this.orderId});

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  Order? _order;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final o = await OrderService().getOrder(widget.orderId);
      setState(() { _order = o; _loading = false; });
    } catch (e) {
      debugPrint('Order load error: $e');
      setState(() => _loading = false);
    }
  }

  Color get _statusColor {
    switch (_order?.status) {
      case 'delivered': return Colors.green;
      case 'shipped': return Colors.blue;
      case 'cancelled': return Colors.red;
      default: return const Color(0xFF00A6A4);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: Center(child: CircularProgressIndicator(color: Color(0xFF00A6A4))));
    if (_order == null) return Scaffold(appBar: AppBar(), body: const Center(child: Text('Order not found')));

    final o = _order!;
    String dateStr = '';
    try {
      dateStr = DateFormat('d MMM yyyy, h:mm a').format(DateTime.parse(o.createdAt));
    } catch (_) {}

    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: Colors.black,
        title: Text('Order #${o.id.substring(0, 8).toUpperCase()}',
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Status card
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
            child: Row(
              children: [
                Container(
                  width: 48, height: 48,
                  decoration: BoxDecoration(
                      color: _statusColor.withValues(alpha: 0.1),
                      shape: BoxShape.circle),
                  child: Icon(Icons.local_shipping_outlined, color: _statusColor),
                ),
                const SizedBox(width: 14),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(o.statusLabel,
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: _statusColor)),
                    Text(dateStr,
                        style: TextStyle(fontSize: 13, color: Colors.grey.shade500)),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          if (o.trackingNumber != null) _infoCard('Tracking Number', o.trackingNumber!),
          if (o.expectedDelivery != null) _infoCard('Expected Delivery', o.expectedDelivery!),
          if (o.notes != null && o.notes!.isNotEmpty) _infoCard('Notes', o.notes!),

          const SizedBox(height: 12),

          if (o.items.isNotEmpty) ...[
            const Text('Items', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
            const SizedBox(height: 10),
            Container(
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
              child: Column(
                children: o.items.asMap().entries.map((entry) {
                  final item = entry.value;
                  return Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      border: entry.key < o.items.length - 1
                          ? Border(bottom: BorderSide(color: Colors.grey.shade100))
                          : null,
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 44, height: 44,
                          decoration: BoxDecoration(
                              color: Colors.grey.shade100,
                              borderRadius: BorderRadius.circular(8)),
                          child: const Icon(Icons.medication_outlined, color: Colors.grey, size: 20),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(item.productName,
                                  style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 14)),
                              Text('Qty: ${item.quantity}',
                                  style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  );
                }).toList(),
              ),
            ),
          ] else ...[
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
              child: Text(
                '${o.itemCount} item${o.itemCount != 1 ? 's' : ''} in this order',
                style: TextStyle(color: Colors.grey.shade600),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _infoCard(String label, String value) => Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
            Flexible(
              child: Text(value,
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                  textAlign: TextAlign.end),
            ),
          ],
        ),
      );
}
