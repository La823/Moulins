import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../models/retailer.dart';
import '../../providers/auth_provider.dart';
import '../../services/retailer_service.dart';
import 'retailer_orders_screen.dart';

/// One retailer order. The partner accepts it (with a rate per product),
/// declines it, marks it dispatched / delivered, and can send it to Moulins
/// as their own order. The retailer sees its progress and can cancel it
/// until it is accepted.
class RetailerOrderDetailScreen extends ConsumerStatefulWidget {
  final String orderId;
  const RetailerOrderDetailScreen({super.key, required this.orderId});

  @override
  ConsumerState<RetailerOrderDetailScreen> createState() => _RetailerOrderDetailScreenState();
}

class _RetailerOrderDetailScreenState extends ConsumerState<RetailerOrderDetailScreen> {
  static const _teal = Color(0xFF00A6A4);
  final _service = RetailerService();
  RetailerOrder? _order;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final o = await _service.getOrder(widget.orderId);
      if (mounted)
        setState(() {
          _order = o;
          _error = null;
        });
    } catch (e) {
      if (mounted) setState(() => _error = RetailerService.messageOf(e, fallback: 'This order could not be loaded.'));
    }
  }

  void _snack(String text, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(text),
      backgroundColor: error ? Colors.red : _teal,
      behavior: SnackBarBehavior.floating,
    ));
  }

  Future<void> _run(Future<void> Function() action, String done) async {
    setState(() => _busy = true);
    try {
      await action();
      _snack(done);
      await _load();
    } catch (e) {
      _snack(RetailerService.messageOf(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // Partner: a rate for each product, then accept.
  Future<void> _accept(RetailerOrder o) async {
    final ctrls = {for (final it in o.items) it.id: TextEditingController(text: it.rate?.toStringAsFixed(2) ?? '')};
    final noteCtrl = TextEditingController();
    String? error;
    final rates = await showModalBottomSheet<Map<String, double>>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => Padding(
          padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Accept order', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                Text('Enter your rate per strip, bottle or other unit the retailer ordered. The retailer will see these rates and the total.',
                    style: TextStyle(fontSize: 12.5, color: Colors.grey.shade600)),
                const SizedBox(height: 14),
                ...o.items.map((it) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Row(children: [
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(it.productName, style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13.5)),
                            Text(
                                '${it.quantityLabel}${it.mrp != null ? ' · MRP Rs. ${it.mrp!.toStringAsFixed(2)} per ${it.unit.toLowerCase()}' : ''}',
                                style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                          ]),
                        ),
                        SizedBox(
                          width: 110,
                          child: TextField(
                            controller: ctrls[it.id],
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            decoration: InputDecoration(
                                prefixText: 'Rs. ', isDense: true, border: const OutlineInputBorder(), hintText: 'per ${it.unit.toLowerCase()}'),
                          ),
                        ),
                      ]),
                    )),
                TextField(
                  controller: noteCtrl,
                  decoration: const InputDecoration(
                      labelText: 'Note for the retailer (optional)', border: OutlineInputBorder()),
                ),
                if (error != null) ...[
                  const SizedBox(height: 8),
                  Text(error!, style: const TextStyle(color: Colors.red, fontSize: 12.5)),
                ],
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton(
                    style:
                        ElevatedButton.styleFrom(backgroundColor: _teal, foregroundColor: Colors.white, elevation: 0),
                    onPressed: () {
                      final out = <String, double>{};
                      for (final it in o.items) {
                        final v = double.tryParse(ctrls[it.id]!.text.trim());
                        if (v == null || v < 0) {
                          setSheet(() => error = 'Please enter a rate for every product in the order.');
                          return;
                        }
                        out[it.id] = v;
                      }
                      Navigator.pop(ctx, out);
                    },
                    child: const Text('Accept order'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    if (rates == null) return;
    await _run(() => _service.accept(o.id, rates, note: noteCtrl.text.trim()), 'The order has been accepted.');
  }

  Future<void> _reject(RetailerOrder o) async {
    final ctrl = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Decline order?'),
        content: TextField(
          controller: ctrl,
          decoration: const InputDecoration(labelText: 'Reason (shown to the retailer)'),
          maxLines: 2,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
              child: const Text('Decline', style: TextStyle(color: Colors.red))),
        ],
      ),
    );
    if (reason == null) return;
    await _run(() => _service.reject(o.id, reason), 'The order has been declined.');
  }

  Future<bool> _confirm(String title, String body, String action) async =>
      await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(title),
          content: Text(body),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            TextButton(onPressed: () => Navigator.pop(ctx, true), child: Text(action)),
          ],
        ),
      ) ==
      true;

  Future<void> _forward(RetailerOrder o) async {
    if (!await _confirm('Order these products from Moulins?',
        'The products in ${o.number} will be placed as your own order to Moulins, in whole boxes (strips rounded up to full boxes).', 'Place order')) {
      return;
    }
    setState(() => _busy = true);
    try {
      final id = await _service.forward(o.id);
      _snack('The order has been sent to Moulins as your order.');
      if (mounted) context.push('/orders/$id');
      await _load();
    } catch (e) {
      _snack(RetailerService.messageOf(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _button(String label, IconData icon, VoidCallback? onTap, {bool primary = false, Color? color}) => SizedBox(
        width: double.infinity,
        height: 46,
        child: primary
            ? ElevatedButton.icon(
                onPressed: _busy ? null : onTap,
                icon: Icon(icon, size: 18),
                label: Text(label),
                style: ElevatedButton.styleFrom(backgroundColor: _teal, foregroundColor: Colors.white, elevation: 0),
              )
            : OutlinedButton.icon(
                onPressed: _busy ? null : onTap,
                icon: Icon(icon, size: 18, color: color),
                label: Text(label, style: TextStyle(color: color)),
              ),
      );

  @override
  Widget build(BuildContext context) {
    final isRetailer = (ref.watch(authProvider).user?.buysFromPartner ?? false);
    final o = _order;
    final fmt = DateFormat('d MMM yyyy, h:mm a');
    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: Colors.black,
        title: Text(o?.number ?? 'Order', style: const TextStyle(fontWeight: FontWeight.w600)),
      ),
      body: o == null
          ? Center(
              child: _error != null
                  ? Padding(padding: const EdgeInsets.all(24), child: Text(_error!, textAlign: TextAlign.center))
                  : const CircularProgressIndicator(color: _teal))
          : RefreshIndicator(
              onRefresh: _load,
              color: _teal,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  _card(Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Expanded(
                        child: Text(isRetailer ? 'To ${o.partnerName}' : o.retailerDisplay,
                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                      ),
                      Text(retailerOrderStatusLabels[o.status] ?? o.status,
                          style: TextStyle(color: retailerOrderStatusColor(o.status), fontWeight: FontWeight.w600)),
                    ]),
                    if (!isRetailer) ...[
                      const SizedBox(height: 4),
                      Text(
                          [if (o.shopName != null && o.shopName!.isNotEmpty) o.retailerName, o.retailerPhone]
                              .join(' · '),
                          style: TextStyle(fontSize: 12.5, color: Colors.grey.shade600)),
                    ],
                    const SizedBox(height: 4),
                    Text('Placed ${fmt.format(o.createdAt.toLocal())}',
                        style: TextStyle(fontSize: 12.5, color: Colors.grey.shade600)),
                    if (o.notes != null) ...[
                      const SizedBox(height: 8),
                      Text('Retailer\'s note: ${o.notes}', style: const TextStyle(fontSize: 13)),
                    ],
                    if (o.partnerNote != null) ...[
                      const SizedBox(height: 6),
                      Text('Partner\'s note: ${o.partnerNote}', style: const TextStyle(fontSize: 13)),
                    ],
                    if (o.forwardedOrderId != null) ...[
                      const SizedBox(height: 8),
                      if (isRetailer)
                        Text('Your partner has ordered these products from Moulins.',
                            style: TextStyle(fontSize: 12.5, color: Colors.grey.shade700))
                      else
                        GestureDetector(
                          onTap: () => context.push('/orders/${o.forwardedOrderId}'),
                          child: const Text('Ordered from Moulins: view your order ›',
                              style: TextStyle(fontSize: 13, color: _teal, fontWeight: FontWeight.w600)),
                        ),
                    ],
                  ])),
                  const SizedBox(height: 12),
                  _card(Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('Products', style: TextStyle(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    ...o.items.map((it) => Padding(
                          padding: const EdgeInsets.symmetric(vertical: 6),
                          child: Row(children: [
                            Expanded(
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text(it.productName,
                                    style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500)),
                                Text(
                                    '${it.quantityLabel}${it.mrp != null ? ' · MRP Rs. ${it.mrp!.toStringAsFixed(2)} per ${it.unit.toLowerCase()}' : ''}',
                                    style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                              ]),
                            ),
                            if (it.rate != null)
                              Text('Rs. ${(it.rate! * it.quantity).toStringAsFixed(2)}',
                                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                          ]),
                        )),
                    if (o.total != null) ...[
                      const Divider(),
                      Row(children: [
                        const Text('Total', style: TextStyle(fontWeight: FontWeight.w700)),
                        const Spacer(),
                        Text('Rs. ${o.total!.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w700)),
                      ]),
                    ],
                  ])),
                  const SizedBox(height: 12),
                  // actions
                  if (isRetailer && o.status == 'pending')
                    _button('Cancel order', Icons.close, () async {
                      if (await _confirm('Cancel this order?', '${o.number} will be withdrawn.', 'Cancel order')) {
                        await _run(() => _service.cancel(o.id), 'The order has been cancelled.');
                      }
                    }, color: Colors.red),
                  if (!isRetailer) ...[
                    if (o.status == 'pending') ...[
                      _button('Accept with rates', Icons.check, () => _accept(o), primary: true),
                      const SizedBox(height: 8),
                      _button('Decline', Icons.close, () => _reject(o), color: Colors.red),
                      const SizedBox(height: 8),
                    ],
                    if (o.status == 'accepted') ...[
                      _button('Mark as dispatched', Icons.local_shipping_outlined,
                          () => _run(() => _service.dispatch(o.id), 'The order has been marked as dispatched.'),
                          primary: true),
                      const SizedBox(height: 8),
                    ],
                    if (o.status == 'accepted' || o.status == 'dispatched') ...[
                      _button('Mark as delivered', Icons.inventory_2_outlined,
                          () => _run(() => _service.deliver(o.id), 'The order has been marked as delivered.'),
                          primary: o.status == 'dispatched'),
                      const SizedBox(height: 8),
                    ],
                    if (o.forwardedOrderId == null && o.status != 'rejected' && o.status != 'cancelled')
                      _button('Order these from Moulins', Icons.shopping_cart_checkout, () => _forward(o)),
                  ],
                  if (o.events.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    _card(Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('History', style: TextStyle(fontWeight: FontWeight.w600)),
                      const SizedBox(height: 6),
                      ...o.events.map((e) => Padding(
                            padding: const EdgeInsets.symmetric(vertical: 3),
                            child: Text(
                              '${fmt.format(e.createdAt.toLocal())} · ${e.description}${e.actorName.isNotEmpty ? ' (${e.actorName})' : ''}',
                              style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
                            ),
                          )),
                    ])),
                  ],
                ],
              ),
            ),
    );
  }

  Widget _card(Widget child) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.grey.shade200)),
        child: child,
      );
}
