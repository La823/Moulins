import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../models/retailer.dart';
import '../../services/retailer_service.dart';
import 'retailer_orders_screen.dart' show retailerOrderStatusColor;
import '../../widgets/shell_leading.dart';

/// Partner: one retailer, their details and their orders to the partner.
/// Edit, documents, password reset and removal are done by the retailers
/// list ([onAction]), which already owns those forms; this page reloads
/// afterwards, and closes when the retailer is removed.
class RetailerDetailScreen extends StatefulWidget {
  final Retailer retailer;

  /// Runs 'edit' / 'docs' / 'reset' / 'remove'; returns true when the
  /// retailer changed (or was removed).
  final Future<bool> Function(Retailer r, String action) onAction;

  const RetailerDetailScreen({super.key, required this.retailer, required this.onAction});

  @override
  State<RetailerDetailScreen> createState() => _RetailerDetailScreenState();
}

const _teal = Color(0xFF00A6A4);
const _tealDark = Color(0xFF00807E);
const _ink = Color(0xFF1A1A1A);
const _page = Color(0xFFF6F7F8);
const _border = Color(0xFFE8EAED);
const _rule = Color(0xFFF0F1F3);
final _money = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 2);
final _when = DateFormat('d MMM y, h:mm a');

class _RetailerDetailScreenState extends State<RetailerDetailScreen> {
  final _service = RetailerService();
  late Retailer _r = widget.retailer;
  List<RetailerOrder>? _orders;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait([_service.getRetailers(), _service.getOrders(incoming: true)]);
      if (!mounted) return;
      final retailers = results[0] as List<Retailer>;
      final orders = (results[1] as List<RetailerOrder>)
          .where((o) => o.retailerId == _r.id || (o.retailerId.isEmpty && o.retailerPhone == _r.phone && !o.fromDoctor))
          .toList()
        ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
      setState(() {
        _r = retailers.where((x) => x.id == _r.id).firstOrNull ?? _r;
        _orders = orders;
        _error = null;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _orders ??= [];
          _error = RetailerService.messageOf(e);
        });
      }
    }
  }

  Future<void> _act(String action) async {
    final changed = await widget.onAction(_r, action);
    if (!mounted || !changed) return;
    if (action == 'remove') {
      Navigator.of(context).pop();
    } else {
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _page,
      appBar: AppBar(leading: const ShellBack(), 
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: Colors.black,
        title: const Text('Retailer', style: TextStyle(fontWeight: FontWeight.w600)),
        actions: [
          PopupMenuButton<String>(
            onSelected: _act,
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'edit', child: Text('Edit details')),
              PopupMenuItem(value: 'docs', child: Text('GST & drug licences')),
              PopupMenuItem(value: 'reset', child: Text('Reset password')),
              PopupMenuItem(value: 'remove', child: Text('Remove retailer', style: TextStyle(color: Colors.red))),
            ],
          ),
        ],
      ),
      body: RefreshIndicator(
        color: _teal,
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 28), children: [
          _header(),
          const SizedBox(height: 12),
          _details(),
          ..._ordersSection(),
        ]),
      ),
    );
  }

  // ---- the shop: name, contact, call ----

  Widget _header() {
    final hasShop = _r.shopName != null && _r.shopName!.isNotEmpty;
    return _card([
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 12, 14),
        child: Row(children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(color: _teal.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(14)),
            child: const Icon(Icons.storefront_outlined, color: _tealDark, size: 26),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(_r.displayName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: _ink)),
              const SizedBox(height: 2),
              Text(
                [if (hasShop) _r.name, if (_r.city != null && _r.city!.isNotEmpty) _r.city!].join(' · '),
                style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
              ),
            ]),
          ),
        ]),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        child: Row(children: [
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () => launchUrl(Uri.parse('tel:${_r.phone}')),
              icon: const Icon(Icons.call_outlined, size: 18),
              label: Text(_r.phone),
              style: OutlinedButton.styleFrom(
                foregroundColor: _tealDark,
                side: const BorderSide(color: _border),
                padding: const EdgeInsets.symmetric(vertical: 11),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () => _act('edit'),
              icon: const Icon(Icons.edit_outlined, size: 18),
              label: const Text('Edit'),
              style: OutlinedButton.styleFrom(
                foregroundColor: _tealDark,
                side: const BorderSide(color: _border),
                padding: const EdgeInsets.symmetric(vertical: 11),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
          ),
        ]),
      ),
    ]);
  }

  // ---- address, licences, last login ----

  Widget _details() {
    final gst = _r.gstNumber == null
        ? 'Not added'
        : '${_r.gstNumber}  ·  ${_r.gstVerified ? 'checked' : 'not checked'}';
    final dl = _r.dlCount == 0 ? 'Not added' : '${_r.dlVerified} of ${_r.dlCount} checked';
    return _card([
      if (_r.address != null && _r.address!.isNotEmpty) _info(Icons.place_outlined, 'Address', _r.address!),
      _info(Icons.receipt_outlined, 'GST', gst,
          warn: _r.gstNumber != null && !_r.gstVerified, onTap: () => _act('docs')),
      _info(Icons.verified_outlined, 'Drug licences', dl,
          warn: _r.dlCount > 0 && _r.dlVerified < _r.dlCount, onTap: () => _act('docs')),
      _info(Icons.login, 'Last signed in',
          _r.lastLoginAt == null ? 'Not yet' : _when.format(_r.lastLoginAt!.toLocal())),
    ]);
  }

  Widget _info(IconData icon, String label, String value, {bool warn = false, VoidCallback? onTap}) => InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(icon, size: 19, color: Colors.grey.shade500),
            const SizedBox(width: 12),
            SizedBox(
              width: 104,
              child: Text(label, style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
            ),
            Expanded(
              child: Text(value,
                  style: TextStyle(
                    fontSize: 13.5,
                    color: warn ? Colors.orange.shade800 : _ink,
                    fontWeight: FontWeight.w500,
                    height: 1.3,
                  )),
            ),
            if (onTap != null) Icon(Icons.chevron_right, size: 18, color: Colors.grey.shade400),
          ]),
        ),
      );

  // ---- orders: a short summary, then each order ----

  List<Widget> _ordersSection() {
    final orders = _orders;
    if (orders == null) {
      return const [Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator(color: _teal)))];
    }
    final live = orders.where((o) => o.status != 'rejected' && o.status != 'cancelled');
    final value = live.fold<double>(0, (s, o) => s + (o.total ?? 0));
    final waiting = orders.where((o) => o.status == 'pending').length;
    return [
      Padding(
        padding: const EdgeInsets.fromLTRB(4, 22, 4, 8),
        child: Row(children: [
          const Expanded(child: Text('Orders', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: _ink))),
          if (orders.isNotEmpty)
            Text('${orders.length} · ${_money.format(value)}',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.grey.shade600)),
        ]),
      ),
      if (_error != null)
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text(_error!, style: TextStyle(color: Colors.red.shade700, fontSize: 13)),
        ),
      if (waiting > 0)
        Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(color: Colors.orange.shade50, borderRadius: BorderRadius.circular(12)),
          child: Text('$waiting order${waiting == 1 ? '' : 's'} waiting for you to accept',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.orange.shade900)),
        ),
      if (orders.isEmpty)
        _card([
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text('No orders from this retailer yet.', style: TextStyle(fontSize: 13.5, color: Colors.grey.shade600)),
          ),
        ])
      else
        _card([for (final o in orders) _orderRow(o)]),
    ];
  }

  Widget _orderRow(RetailerOrder o) {
    final color = retailerOrderStatusColor(o.status);
    return InkWell(
      onTap: () => context.push('/retailer-orders/${o.id}').then((_) => _load()),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 10, 12),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Text(o.number, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: _ink)),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: color.withAlpha(25), borderRadius: BorderRadius.circular(10)),
                  child: Text(retailerOrderStatusLabels[o.status] ?? o.status,
                      style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w600)),
                ),
              ]),
              const SizedBox(height: 3),
              Text(
                '${o.itemCount} product${o.itemCount == 1 ? '' : 's'} · ${DateFormat('d MMM y').format(o.createdAt.toLocal())}',
                style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
              ),
            ]),
          ),
          if (o.total != null)
            Text(_money.format(o.total), style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: _ink)),
          Icon(Icons.chevron_right, color: Colors.grey.shade400, size: 20),
        ]),
      ),
    );
  }

  // one white card, its rows split by thin lines
  Widget _card(List<Widget> rows) => Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: _border),
        ),
        child: Material(
          color: Colors.white,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            for (var i = 0; i < rows.length; i++) ...[
              if (i > 0) const Divider(height: 1, thickness: 1, indent: 14, endIndent: 14, color: _rule),
              rows[i],
            ],
          ]),
        ),
      );
}
