import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../models/staff_order.dart';
import '../../services/admin_order_service.dart';

Color staffOrderStatusColor(String s) => switch (s) {
      'pending' => Colors.orange.shade700,
      'confirmed' => Colors.blue.shade700,
      'transferred' => Colors.indigo.shade600,
      'shipped' => Colors.purple.shade600,
      'delivered' => Colors.green.shade700,
      'cancelled' => Colors.red.shade600,
      _ => Colors.grey.shade600,
    };

String staffStatusLabel(String s) => s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';

/// Staff: every order, as on the website's Orders page (orders_view).
class AdminOrdersScreen extends StatefulWidget {
  const AdminOrdersScreen({super.key});

  @override
  State<AdminOrdersScreen> createState() => _AdminOrdersScreenState();
}

class _AdminOrdersScreenState extends State<AdminOrdersScreen> {
  static const _teal = Color(0xFF00A6A4);
  final _service = AdminOrderService();
  final _searchCtrl = TextEditingController();
  Timer? _debounce;
  List<StaffOrder>? _orders;
  String? _error;
  String _status = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final list = await _service.list(status: _status, search: _searchCtrl.text);
      if (mounted) setState(() { _orders = list; _error = null; });
    } catch (e) {
      if (mounted) setState(() { _orders ??= []; _error = 'The orders could not be loaded. Please try again.'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final list = _orders;
    final fmt = DateFormat('d MMM, h:mm a');
    final money = NumberFormat.decimalPattern('en_IN');
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: Colors.black,
        title: const Text('Orders', style: TextStyle(fontWeight: FontWeight.w600)),
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: TextField(
            controller: _searchCtrl,
            onChanged: (_) {
              _debounce?.cancel();
              _debounce = Timer(const Duration(milliseconds: 400), _load);
            },
            decoration: InputDecoration(
              hintText: 'Search by party or phone',
              prefixIcon: const Icon(Icons.search, color: Colors.grey),
              isDense: true,
              filled: true,
              fillColor: Colors.grey.shade50,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade200)),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade200)),
            ),
          ),
        ),
        SizedBox(
          height: 50,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            children: ['', ...staffOrderStatuses]
                .map((s) => Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(s.isEmpty ? 'All' : staffStatusLabel(s)),
                        selected: _status == s,
                        selectedColor: _teal.withAlpha(40),
                        onSelected: (_) {
                          setState(() => _status = s);
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
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                    children: [
                      if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
                      if (list.isEmpty && _error == null)
                        const Padding(
                          padding: EdgeInsets.only(top: 60),
                          child: Center(child: Text('No orders found.', style: TextStyle(color: Colors.grey))),
                        ),
                      ...list.map((o) {
                        final c = staffOrderStatusColor(o.status);
                        return GestureDetector(
                          onTap: () => context.push('/admin/orders/${o.id}').then((_) => _load()),
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 10),
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(border: Border.all(color: Colors.grey.shade200), borderRadius: BorderRadius.circular(12)),
                            child: Row(children: [
                              Expanded(
                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Text(o.partyName.isEmpty ? o.partyPhone : o.partyName,
                                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14.5)),
                                  const SizedBox(height: 3),
                                  Text(
                                    '${o.ref} · ${o.itemCount} item${o.itemCount == 1 ? '' : 's'} · ${fmt.format(o.createdAt.toLocal())}',
                                    style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                                  ),
                                  if (o.margOrderNo != null)
                                    Text('Marg: ${o.margOrderNo}', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                                ]),
                              ),
                              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                                  decoration: BoxDecoration(color: c.withAlpha(25), borderRadius: BorderRadius.circular(10)),
                                  child: Text(staffStatusLabel(o.status), style: TextStyle(fontSize: 11.5, color: c, fontWeight: FontWeight.w600)),
                                ),
                                if (o.orderTotal != null) ...[
                                  const SizedBox(height: 6),
                                  Text('Rs. ${money.format(o.orderTotal)}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                                ],
                              ]),
                            ]),
                          ),
                        );
                      }),
                    ],
                  ),
                ),
        ),
      ]),
    );
  }
}
