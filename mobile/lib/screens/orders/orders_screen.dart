import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../models/order.dart';
import '../../services/order_service.dart';
import '../../widgets/notification_bell_button.dart';
import '../../widgets/chat_button.dart';
import '../../widgets/profile_button.dart';
import 'package:intl/intl.dart';
import '../../utils/responsive.dart';

class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  List<Order>? _orders;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final orders = await OrderService().getMyOrders();
      setState(() { _orders = orders; _loading = false; });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('My Orders', style: TextStyle(color: Color(0xFF1A1A1A), fontWeight: FontWeight.w600)),
        actions: const [ChatButton(), NotificationBellButton(), ProfileButton(), SizedBox(width: 4)],
      ),
      body: ResponsiveCenter(child: _loading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF00A6A4)))
          : _orders == null || _orders!.isEmpty
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.receipt_long_outlined, size: 64, color: Colors.grey.shade300),
                      const SizedBox(height: 16),
                      const Text('No orders yet', style: TextStyle(color: Colors.grey, fontSize: 16)),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  color: const Color(0xFF00A6A4),
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: _orders!.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (ctx, i) => _OrderCard(order: _orders![i]),
                  ),
                ),
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  final Order order;
  const _OrderCard({required this.order});

  Color get _statusColor {
    switch (order.status) {
      case 'delivered': return Colors.green;
      case 'shipped': return Colors.blue;
      case 'cancelled': return Colors.red;
      default: return const Color(0xFF00A6A4);
    }
  }

  @override
  Widget build(BuildContext context) {
    String dateStr = '';
    try {
      final dt = DateTime.parse(order.createdAt);
      dateStr = DateFormat('d MMM yyyy').format(dt);
    } catch (_) {}

    return GestureDetector(
      onTap: () => context.push('/orders/${order.id}'),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: Colors.grey.shade200),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Order #${order.id.substring(0, 8).toUpperCase()}', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: _statusColor.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                  child: Text(order.statusLabel, style: TextStyle(fontSize: 12, color: _statusColor, fontWeight: FontWeight.w600)),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(dateStr, style: TextStyle(fontSize: 13, color: Colors.grey.shade500)),
            const SizedBox(height: 4),
            Text('${order.itemCount} item${order.itemCount != 1 ? 's' : ''}', style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(''),
                const Icon(Icons.chevron_right, color: Colors.grey, size: 20),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
