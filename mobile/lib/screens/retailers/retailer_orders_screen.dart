import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../models/retailer.dart';
import '../../providers/auth_provider.dart';
import '../../services/retailer_service.dart';
import '../../widgets/app_drawer.dart';
import '../../widgets/notification_bell_button.dart';
import '../../widgets/profile_button.dart';

Color retailerOrderStatusColor(String status) => switch (status) {
      'pending' => Colors.orange.shade700,
      'accepted' => const Color(0xFF00A6A4),
      'dispatched' => Colors.blue.shade600,
      'delivered' => Colors.green.shade700,
      _ => Colors.grey.shade600, // rejected, cancelled
    };

/// Retailer orders: for a partner, the orders their retailers placed with
/// them; for a retailer, their own orders to the partner.
class RetailerOrdersScreen extends ConsumerStatefulWidget {
  const RetailerOrdersScreen({super.key});

  @override
  ConsumerState<RetailerOrdersScreen> createState() => _RetailerOrdersScreenState();
}

class _RetailerOrdersScreenState extends ConsumerState<RetailerOrdersScreen> {
  static const _teal = Color(0xFF00A6A4);
  final _service = RetailerService();
  List<RetailerOrder>? _orders;
  String? _error;
  String _status = '';

  bool get _isRetailer => ref.read(authProvider).user?.role == 'retailer';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    try {
      final list = await _service.getOrders(incoming: !_isRetailer, status: _status);
      if (mounted)
        setState(() {
          _orders = list;
          _error = null;
        });
    } catch (e) {
      if (mounted)
        setState(() {
          _orders ??= [];
          _error = RetailerService.messageOf(e);
        });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isRetailer = ref.watch(authProvider).user?.role == 'retailer';
    final list = _orders;
    final fmt = DateFormat('d MMM yyyy, h:mm a');
    final filters = {
      '': 'All',
      'pending': 'New',
      'accepted': 'Accepted',
      'dispatched': 'Dispatched',
      'delivered': 'Delivered'
    };
    return Scaffold(
      backgroundColor: Colors.white,
      drawer: const AppDrawer(),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: Colors.black,
        title: Text(isRetailer ? 'My Orders' : 'Retailer Orders', style: const TextStyle(fontWeight: FontWeight.w600)),
        actions: const [NotificationBellButton(), ProfileButton(), SizedBox(width: 4)],
      ),
      body: Column(
        children: [
          SizedBox(
            height: 52,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 6),
              children: filters.entries
                  .map((f) => Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          label: Text(f.value),
                          selected: _status == f.key,
                          selectedColor: _teal.withAlpha(40),
                          onSelected: (_) {
                            setState(() => _status = f.key);
                            _load();
                          },
                        ),
                      ))
                  .toList(),
            ),
          ),
          Expanded(
            child: list == null
                ? const Center(child: CircularProgressIndicator(color: _teal))
                : RefreshIndicator(
                    onRefresh: _load,
                    color: _teal,
                    child: ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(16, 6, 16, 16),
                      children: [
                        if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
                        if (list.isEmpty && _error == null)
                          Padding(
                            padding: const EdgeInsets.only(top: 80),
                            child: Column(children: [
                              Icon(Icons.receipt_long_outlined, size: 64, color: Colors.grey.shade300),
                              const SizedBox(height: 14),
                              Text(
                                isRetailer
                                    ? 'You have not placed any orders yet. Add products to your cart to order from your partner.'
                                    : 'No orders from your retailers yet.',
                                textAlign: TextAlign.center,
                                style: const TextStyle(color: Colors.grey, fontSize: 14),
                              ),
                            ]),
                          ),
                        ...list.map((o) {
                          final color = retailerOrderStatusColor(o.status);
                          return GestureDetector(
                            onTap: () => context.push('/retailer-orders/${o.id}').then((_) => _load()),
                            child: Container(
                              margin: const EdgeInsets.only(bottom: 10),
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                  border: Border.all(color: Colors.grey.shade200),
                                  borderRadius: BorderRadius.circular(12)),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(children: [
                                    Text(o.number, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                                    const Spacer(),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                      decoration: BoxDecoration(
                                          color: color.withAlpha(25), borderRadius: BorderRadius.circular(12)),
                                      child: Text(retailerOrderStatusLabels[o.status] ?? o.status,
                                          style: TextStyle(fontSize: 12, color: color, fontWeight: FontWeight.w600)),
                                    ),
                                  ]),
                                  const SizedBox(height: 6),
                                  Text(isRetailer ? 'To ${o.partnerName}' : o.retailerDisplay,
                                      style: TextStyle(fontSize: 13.5, color: Colors.grey.shade800)),
                                  const SizedBox(height: 4),
                                  Text(
                                    '${o.itemCount} product${o.itemCount == 1 ? '' : 's'} · ${fmt.format(o.createdAt.toLocal())}'
                                    '${o.total != null ? ' · Rs. ${o.total!.toStringAsFixed(2)}' : ''}',
                                    style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
                                  ),
                                ],
                              ),
                            ),
                          );
                        }),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}
