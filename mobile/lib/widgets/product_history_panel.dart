import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../services/admin_order_service.dart';

/// Staff: a product's history with this party, slid in from the right on
/// an order line, like the website's panel (MargRateHistory.jsx): what they
/// paid before (Marg bills, earlier app orders) with each batch's MRP and
/// purchase rate, and how those batches were bought.
Future<void> showProductHistory(
  BuildContext context, {
  required String partnerId,
  required String productId,
  required String productName,
  String? orderId,
  String? lineBatchCode,
}) {
  return showGeneralDialog(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'Close',
    barrierColor: Colors.black38,
    transitionDuration: const Duration(milliseconds: 220),
    pageBuilder: (_, __, ___) => Align(
      alignment: Alignment.centerRight,
      child: FractionallySizedBox(
        widthFactor: 0.92,
        heightFactor: 1,
        child: Material(
          color: Colors.white,
          elevation: 8,
          child: SafeArea(
            child: _HistoryPanel(
              partnerId: partnerId,
              productId: productId,
              productName: productName,
              orderId: orderId,
              lineBatchCode: lineBatchCode,
            ),
          ),
        ),
      ),
    ),
    transitionBuilder: (_, anim, __, child) => SlideTransition(
      position: Tween(begin: const Offset(1, 0), end: Offset.zero)
          .animate(CurvedAnimation(parent: anim, curve: Curves.easeOut)),
      child: child,
    ),
  );
}

class _HistoryPanel extends StatefulWidget {
  final String partnerId, productId, productName;
  final String? orderId, lineBatchCode;
  const _HistoryPanel({
    required this.partnerId,
    required this.productId,
    required this.productName,
    this.orderId,
    this.lineBatchCode,
  });

  @override
  State<_HistoryPanel> createState() => _HistoryPanelState();
}

class _HistoryPanelState extends State<_HistoryPanel> {
  static const _teal = Color(0xFF00A6A4);
  final _money = NumberFormat.decimalPattern('en_IN');
  final _date = DateFormat('d MMM yy');
  Map<String, dynamic>? _h;
  String? _error;
  bool _loading = true;
  bool _byBatch = false;
  List<Map<String, dynamic>>? _recent; // the product's last 5 bills to any party
  bool? _partyOpen, _anyOpen; // the boxes, once opened or closed by hand

  String? get _lineBatch {
    final c = widget.lineBatchCode;
    final i = c?.indexOf('-') ?? -1;
    return i > 0 ? c!.substring(i + 1) : null;
  }

  @override
  void initState() {
    super.initState();
    _loadRecent();
    AdminOrderService()
        .rateHistory(widget.partnerId, widget.productId,
            excludeOrder: widget.orderId, lineBatchCode: widget.lineBatchCode)
        .then((h) {
      if (!mounted) return;
      setState(() {
        _h = h;
        _loading = false;
      });
    }).catchError((_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'The history could not be loaded. It needs the permission to edit orders.';
        });
      }
    });
  }

  Future<void> _loadRecent() async {
    try {
      final r = await AdminOrderService().recentSales(widget.productId);
      if (mounted) setState(() => _recent = r.take(5).toList());
    } catch (_) {
      if (mounted) setState(() => _recent = []);
    }
  }

  // the last 5 bills of the product to any party, and their average rate
  List<Widget> _recentChildren() {
    final r = _recent;
    if (r == null) {
      return const [
        Padding(padding: EdgeInsets.all(12), child: Center(child: CircularProgressIndicator(color: _teal)))
      ];
    }
    if (r.isEmpty) {
      return [
        Text('This product has not been sold to anyone this year.',
            style: TextStyle(fontSize: 12, color: Colors.grey.shade600))
      ];
    }
    final rates = r.map((s) => (s['rate'] as num).toDouble()).toList();
    final avg = rates.reduce((a, b) => a + b) / rates.length;
    final lo = rates.reduce((a, b) => a < b ? a : b), hi = rates.reduce((a, b) => a > b ? a : b);
    return [
      Row(children: [
        _stat('Average of ${r.length}', _rs(avg)),
        _stat('Range', lo == hi ? _rs(lo) : '${_rs(lo)}–${_money.format(hi)}'),
      ]),
      const SizedBox(height: 6),
      ...r.map((s) {
        final qty = (s['qty'] as num?)?.toDouble() ?? 0, free = (s['free'] as num?)?.toDouble() ?? 0;
        return Container(
          padding: const EdgeInsets.symmetric(vertical: 7),
          decoration: BoxDecoration(border: Border(bottom: BorderSide(color: Colors.grey.shade100))),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SizedBox(
                width: 64, child: Text(_d(s['date']), style: TextStyle(fontSize: 12, color: Colors.grey.shade700))),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text((() {
                  // Marg party names mostly end with the city already
                  final name = '${s['customer'] ?? ''}', city = '${s['city'] ?? ''}';
                  return city.isEmpty || name.toUpperCase().contains(city.toUpperCase()) ? name : '$name, $city';
                })(), style: const TextStyle(fontSize: 12.5)),
                Text(
                  'Bill ${s['bill_no']} · Qty ${qty.toStringAsFixed(0)}${free > 0 ? ' + ${free.toStringAsFixed(0)} free' : ''}',
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                ),
              ]),
            ),
            Text(_rs(s['rate']), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          ]),
        );
      }),
    ];
  }

  String _rs(dynamic v) => v == null ? '-' : 'Rs. ${_money.format((v as num).toDouble())}';
  String _d(dynamic s) {
    final t = DateTime.tryParse(s?.toString() ?? '');
    return t == null ? '' : _date.format(t.toLocal());
  }

  String? _margin(dynamic rate, dynamic purchase) {
    if (rate == null || purchase == null || (purchase as num) == 0) return null;
    final m = ((rate as num) - purchase) / purchase * 100;
    return '${m >= 0 ? '+' : ''}${m.toStringAsFixed(0)}%';
  }

  Widget _stat(String label, String value, {String? sub}) => Expanded(
        child: Container(
          padding: const EdgeInsets.all(8),
          margin: const EdgeInsets.only(right: 6),
          decoration: BoxDecoration(color: Colors.grey.shade50, borderRadius: BorderRadius.circular(8)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: TextStyle(fontSize: 10.5, color: Colors.grey.shade600)),
            const SizedBox(height: 2),
            Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
            if (sub != null) Text(sub, style: TextStyle(fontSize: 10, color: Colors.grey.shade500)),
          ]),
        ),
      );

  // a box whose title row folds it open or closed
  Widget _foldBox(String title,
          {required bool open, required VoidCallback onToggle, required Color color, required List<Widget> children}) =>
      Container(
        margin: const EdgeInsets.only(top: 12),
        decoration:
            BoxDecoration(border: Border.all(color: color.withAlpha(60)), borderRadius: BorderRadius.circular(10)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          InkWell(
            onTap: onToggle,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
              child: Row(children: [
                Expanded(
                  child: Text(title.toUpperCase(),
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.6, color: color)),
                ),
                Icon(open ? Icons.remove : Icons.add, size: 20, color: color),
              ]),
            ),
          ),
          if (open)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
            ),
        ]),
      );

  Widget _section(String title, List<Widget> children, {Color? color}) => Padding(
        padding: const EdgeInsets.only(top: 16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title.toUpperCase(),
              style: TextStyle(
                  fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.6, color: color ?? Colors.grey.shade700)),
          const SizedBox(height: 6),
          ...children,
        ]),
      );

  // one past sale (a Marg bill) or an earlier app order
  Widget _saleRow(Map p) {
    final isOrder = p['source'] == 'order';
    final margin = _margin(p['rate'], p['purchase_rate']);
    final qty = (p['qty'] as num?)?.toDouble() ?? 0;
    final free = (p['free'] as num?)?.toDouble() ?? 0;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 7),
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: Colors.grey.shade100))),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: 64, child: Text(_d(p['date']), style: TextStyle(fontSize: 12, color: Colors.grey.shade700))),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(
              isOrder ? 'App order${p['status'] != null ? ' · ${p['status']}' : ''}' : 'Bill ${p['ref'] ?? ''}',
              style: const TextStyle(fontSize: 12.5),
            ),
            Text(
              [
                'Qty ${qty % 1 == 0 ? qty.toStringAsFixed(0) : qty}${free > 0 ? ' + ${free.toStringAsFixed(0)} free' : ''}',
                if (p['batch'] != null) 'Batch ${p['batch']}',
                if ((p['batch_mrp'] ?? p['mrp']) != null) 'MRP ${_rs(p['batch_mrp'] ?? p['mrp'])}',
                if (p['purchase_rate'] != null) 'Purchase ${_rs(p['purchase_rate'])}',
              ].join(' · '),
              style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
            ),
          ]),
        ),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(_rs(p['rate']), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          if (margin != null)
            Text(margin,
                style: TextStyle(
                    fontSize: 10.5, color: margin.startsWith('+') ? Colors.green.shade700 : Colors.red.shade600)),
        ]),
      ]),
    );
  }

  Widget _purchaseRow(Map pu, {bool onLine = false}) => Container(
        padding: const EdgeInsets.symmetric(vertical: 7, horizontal: 6),
        decoration: BoxDecoration(
          color: onLine ? Colors.blue.shade50.withValues(alpha: 0.6) : null,
          border: Border(bottom: BorderSide(color: Colors.grey.shade100)),
        ),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 58, child: Text(_d(pu['date']), style: TextStyle(fontSize: 12, color: Colors.grey.shade700))),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(pu['supplier'] ?? 'Supplier', style: const TextStyle(fontSize: 12.5)),
              Text(
                [
                  if (pu['bill_no'] != null && pu['bill_no'] != '') 'Bill ${pu['bill_no']}',
                  if (pu['batch'] != null) 'Batch ${pu['batch']}',
                  if (pu['qty'] != null) 'Qty ${(pu['qty'] as num).toStringAsFixed(0)}',
                  if (pu['mrp'] != null) 'MRP ${_rs(pu['mrp'])}',
                  if (onLine) 'on this line',
                ].join(' · '),
                style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
              ),
            ]),
          ),
          Text(_rs(pu['rate']), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
        ]),
      );

  @override
  Widget build(BuildContext context) {
    final h = _h;
    final points = (h?['points'] as List? ?? []).cast<Map>();
    final bills = points.where((p) => p['source'] != 'order').toList();
    final orders = points.where((p) => p['source'] == 'order').toList();
    final purchases = (h?['purchases'] as List? ?? []).cast<Map>().toList();
    final lineBatch = _lineBatch;
    // the line's batch first in the purchases
    purchases.sort((a, b) {
      final la = a['batch'] == lineBatch ? 0 : 1, lb = b['batch'] == lineBatch ? 0 : 1;
      if (la != lb) return la - lb;
      return (b['date'] ?? '').toString().compareTo((a['date'] ?? '').toString());
    });
    // a batch on this line bought before this financial year: Marg's stock
    // record of its supplier invoice
    final earlier = (h?['line_batches'] as List? ?? [])
        .cast<Map>()
        .where((lb) => !purchases.any((p) => p['batch'] == lb['batch']) && lb['supplier_invoice'] != null)
        .toList();

    // sales grouped by batch, most recently sold batch first
    final groups = <String, List<Map>>{};
    for (final p in bills) {
      groups.putIfAbsent((p['batch'] ?? '-').toString(), () => []).add(p);
    }

    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 4, 8),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('HISTORY WITH THIS PARTY',
                  style: TextStyle(fontSize: 11, letterSpacing: 0.6, color: Colors.grey.shade600)),
              const SizedBox(height: 2),
              Text(widget.productName, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
            ]),
          ),
          IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.of(context).pop()),
        ]),
      ),
      const Divider(height: 1),
      Expanded(
        child: _loading
            ? const Center(child: CircularProgressIndicator(color: _teal))
            : _error != null
                ? Padding(padding: const EdgeInsets.all(20), child: Text(_error!, textAlign: TextAlign.center))
                : ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 24), children: [
                    // box 1: this party's history (open), box 2: the product's last 5 bills
                    // to any party (open instead when this party never bought it)
                    _foldBox(
                      'Sales to this party',
                      open: _partyOpen ?? points.isNotEmpty,
                      onToggle: () => setState(() => _partyOpen = !(_partyOpen ?? points.isNotEmpty)),
                      color: Colors.blue.shade800,
                      children: points.isEmpty
                          ? <Widget>[
                              Text('Never sold to this party before.',
                                  style: TextStyle(fontSize: 12.5, color: Colors.grey.shade600))
                            ]
                          : <Widget>[
                              Row(children: [
                                _stat('Last', _rs(h!['last']?['rate']), sub: _d(h!['last']?['date'])),
                                _stat('Average', _rs(h!['avg_rate']),
                                    sub: '${h!['times'] ?? 0} time${h!['times'] == 1 ? '' : 's'}'),
                                _stat(
                                    'Range',
                                    h!['min_rate'] == null
                                        ? '-'
                                        : '${_rs(h!['min_rate'])}–${_money.format((h!['max_rate'] as num).toDouble())}'),
                              ]),
                              if (bills.isNotEmpty) ...[
                                const SizedBox(height: 10),
                                Row(children: [
                                  ChoiceChip(
                                    label: const Text('All sales'),
                                    selected: !_byBatch,
                                    selectedColor: _teal.withAlpha(40),
                                    onSelected: (_) => setState(() => _byBatch = false),
                                  ),
                                  const SizedBox(width: 8),
                                  ChoiceChip(
                                    label: const Text('By batch'),
                                    selected: _byBatch,
                                    selectedColor: _teal.withAlpha(40),
                                    onSelected: (_) => setState(() => _byBatch = true),
                                  ),
                                ]),
                                const SizedBox(height: 4),
                                if (!_byBatch)
                                  ...bills.map(_saleRow)
                                else
                                  ...groups.entries.map((g) {
                                    final first = g.value.first;
                                    return Container(
                                      margin: const EdgeInsets.only(top: 8),
                                      decoration: BoxDecoration(
                                          border: Border.all(color: Colors.grey.shade200),
                                          borderRadius: BorderRadius.circular(8)),
                                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                        Container(
                                          width: double.infinity,
                                          padding: const EdgeInsets.all(8),
                                          color: g.key == lineBatch ? Colors.blue.shade50 : Colors.grey.shade50,
                                          child: Text(
                                            [
                                              'Batch ${g.key}',
                                              if (first['expiry'] != null) 'Exp ${_d(first['expiry'])}',
                                              if ((first['batch_mrp'] ?? first['mrp']) != null)
                                                'MRP ${_rs(first['batch_mrp'] ?? first['mrp'])}',
                                              if (first['purchase_rate'] != null)
                                                'Purchase ${_rs(first['purchase_rate'])}',
                                              if (g.key == lineBatch) 'on this line',
                                            ].join(' · '),
                                            style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600),
                                          ),
                                        ),
                                        Padding(
                                            padding: const EdgeInsets.symmetric(horizontal: 8),
                                            child: Column(children: g.value.map(_saleRow).toList())),
                                      ]),
                                    );
                                  }),
                              ],
                              if (orders.isNotEmpty) ...[
                                const SizedBox(height: 10),
                                Text('Earlier app orders (no batch)',
                                    style: TextStyle(
                                        fontSize: 11.5, fontWeight: FontWeight.w600, color: Colors.grey.shade700)),
                                ...orders.map(_saleRow),
                              ],
                            ],
                    ),
                    _foldBox(
                      _recent == null || _recent!.isEmpty
                          ? 'Last 5 bills to any party'
                          : 'Last ${_recent!.length} bills to any party',
                      open: _anyOpen ?? points.isEmpty,
                      onToggle: () => setState(() => _anyOpen = !(_anyOpen ?? points.isEmpty)),
                      color: Colors.grey.shade800,
                      children: _recentChildren(),
                    ),
                    _section(
                        'Purchases of these batches',
                        [
                          if (purchases.isEmpty && earlier.isEmpty)
                            Text('No purchases found this financial year.',
                                style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                          ...purchases
                              .map((pu) => _purchaseRow(pu, onLine: lineBatch != null && pu['batch'] == lineBatch)),
                          ...earlier.map((lb) => _purchaseRow({
                                'date': lb['supplier_invoice_date'],
                                'supplier': 'Bought earlier',
                                'bill_no': lb['supplier_invoice'],
                                'batch': lb['batch'],
                                'rate': lb['purchase_rate'],
                                'mrp': lb['mrp'],
                              }, onLine: true)),
                          if (lineBatch != null && !purchases.any((p) => p['batch'] == lineBatch) && earlier.isEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 6),
                              child: Text('No purchase found for $lineBatch, the batch on this line.',
                                  style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
                            ),
                        ],
                        color: Colors.amber.shade800),
                  ]),
      ),
    ]);
  }
}
