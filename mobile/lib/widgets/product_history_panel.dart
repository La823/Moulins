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
        widthFactor: 0.94,
        heightFactor: 1,
        child: Material(
          color: Colors.grey.shade50,
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
  final _dayMonth = DateFormat('d MMM');
  final _year = DateFormat('yyyy');
  Map<String, dynamic>? _h;
  String? _error;
  bool _loading = true;
  bool _byBatch = false;
  List<Map<String, dynamic>>? _recent; // the product's last 5 bills to any party
  bool? _partyOpen, _anyOpen, _buyOpen; // the boxes, once opened or closed by hand

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

  // --- formatting ---

  String _rs(dynamic v) => v == null ? '-' : '₹${_money.format((v as num).toDouble())}';
  String _num(double v) => v % 1 == 0 ? v.toStringAsFixed(0) : v.toString();
  DateTime? _t(dynamic s) => DateTime.tryParse(s?.toString() ?? '')?.toLocal();
  String _d(dynamic s) {
    final t = _t(s);
    return t == null ? '' : '${_dayMonth.format(t)} ${_year.format(t)}';
  }

  // the margin over the purchase rate, e.g. +18%
  double? _marginPct(dynamic rate, dynamic purchase) {
    if (rate == null || purchase == null || (purchase as num) == 0) return null;
    return ((rate as num) - purchase) / purchase * 100;
  }

  // --- building blocks ---

  // a date as a small two-line block: "12 Nov" over "2026"
  Widget _dateBlock(dynamic s) {
    final t = _t(s);
    return SizedBox(
      width: 52,
      child: t == null
          ? const SizedBox()
          : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(_dayMonth.format(t), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
              Text(_year.format(t), style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
            ]),
    );
  }

  // small grey tags for a row's details (qty, batch, MRP...)
  Widget _tags(List<String> items, {Set<String> highlight = const {}}) => Wrap(
        spacing: 4,
        runSpacing: 4,
        children: items
            .map((s) => Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: highlight.contains(s) ? Colors.blue.shade50 : Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(5),
                  ),
                  child: Text(s,
                      style: TextStyle(
                          fontSize: 11.5,
                          color: highlight.contains(s) ? Colors.blue.shade800 : Colors.grey.shade800)),
                ))
            .toList(),
      );

  // the rate on the right of a row, with the margin under it
  Widget _rateBlock(dynamic rate, {double? margin}) =>
      Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
        Text(_rs(rate), style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700)),
        if (margin != null)
          Container(
            margin: const EdgeInsets.only(top: 3),
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
            decoration: BoxDecoration(
              color: margin >= 0 ? Colors.green.shade50 : Colors.red.shade50,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text('${margin >= 0 ? '+' : ''}${margin.toStringAsFixed(0)}%',
                style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: margin >= 0 ? Colors.green.shade800 : Colors.red.shade700)),
          ),
      ]);

  Widget _row({required Widget left, required Widget middle, required Widget right, Color? background}) => Container(
        margin: const EdgeInsets.only(top: 6),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: background ?? Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: Colors.grey.shade200),
        ),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          left,
          const SizedBox(width: 6),
          Expanded(child: middle),
          const SizedBox(width: 8),
          right,
        ]),
      );

  Widget _stat(String label, String value, {String? sub, required Color color}) => Expanded(
        child: Container(
          padding: const EdgeInsets.fromLTRB(10, 8, 8, 8),
          margin: const EdgeInsets.only(right: 6),
          decoration: BoxDecoration(color: color.withAlpha(18), borderRadius: BorderRadius.circular(10)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: TextStyle(fontSize: 11.5, color: Colors.grey.shade700)),
            const SizedBox(height: 2),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(value, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: color)),
            ),
            if (sub != null && sub.isNotEmpty)
              Text(sub, style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
          ]),
        ),
      );

  // a box whose title row folds it open or closed
  Widget _foldBox(String title,
          {required IconData icon,
          int? count,
          required bool open,
          required VoidCallback onToggle,
          required Color color,
          required List<Widget> children}) =>
      Container(
        margin: const EdgeInsets.only(top: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: color.withAlpha(50)),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: onToggle,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 10, 12),
              child: Row(children: [
                Icon(icon, size: 20, color: color),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(title, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: color)),
                ),
                if (count != null && count > 0)
                  Container(
                    margin: const EdgeInsets.only(right: 6),
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                    decoration: BoxDecoration(color: color.withAlpha(25), borderRadius: BorderRadius.circular(10)),
                    child: Text('$count', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: color)),
                  ),
                Icon(open ? Icons.expand_less : Icons.expand_more, size: 24, color: color),
              ]),
            ),
          ),
          if (open)
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 0, 10, 12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
            ),
        ]),
      );

  Widget _empty(String text) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Text(text, style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
      );

  Widget _subhead(String text) => Padding(
        padding: const EdgeInsets.only(top: 12, bottom: 2),
        child: Text(text, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Colors.grey.shade700)),
      );

  // --- rows ---

  // one past sale to this party (a Marg bill) or an earlier app order
  Widget _saleRow(Map p, {bool showBatch = true}) {
    final isOrder = p['source'] == 'order';
    final qty = (p['qty'] as num?)?.toDouble() ?? 0;
    final free = (p['free'] as num?)?.toDouble() ?? 0;
    final batch = p['batch']?.toString();
    final onLine = batch != null && batch == _lineBatch;
    final batchTag = 'Batch $batch';
    return _row(
      left: _dateBlock(p['date']),
      middle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(
          isOrder ? 'App order${p['status'] != null ? ' · ${p['status']}' : ''}' : 'Bill ${p['ref'] ?? ''}',
          style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500),
        ),
        const SizedBox(height: 4),
        _tags([
          'Qty ${_num(qty)}${free > 0 ? ' + ${_num(free)} free' : ''}',
          if (showBatch && batch != null) batchTag,
          if ((p['batch_mrp'] ?? p['mrp']) != null) 'MRP ${_rs(p['batch_mrp'] ?? p['mrp'])}',
          if (p['purchase_rate'] != null) 'Bought ${_rs(p['purchase_rate'])}',
        ], highlight: {if (onLine) batchTag}),
      ]),
      right: _rateBlock(p['rate'], margin: _marginPct(p['rate'], p['purchase_rate'])),
    );
  }

  // one of the product's latest bills to any party
  Widget _recentRow(Map s) {
    final qty = (s['qty'] as num?)?.toDouble() ?? 0, free = (s['free'] as num?)?.toDouble() ?? 0;
    // Marg party names mostly end with the city already
    final name = '${s['customer'] ?? ''}', city = '${s['city'] ?? ''}';
    final party = city.isEmpty || name.toUpperCase().contains(city.toUpperCase()) ? name : '$name, $city';
    return _row(
      left: _dateBlock(s['date']),
      middle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(party, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500)),
        const SizedBox(height: 4),
        _tags([
          'Bill ${s['bill_no']}',
          'Qty ${_num(qty)}${free > 0 ? ' + ${_num(free)} free' : ''}',
        ]),
      ]),
      right: _rateBlock(s['rate']),
    );
  }

  Widget _purchaseRow(Map pu, {bool onLine = false}) => _row(
        background: onLine ? Colors.blue.shade50 : null,
        left: _dateBlock(pu['date']),
        middle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(pu['supplier'] ?? 'Supplier', style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500)),
          const SizedBox(height: 4),
          _tags([
            if (pu['batch'] != null) 'Batch ${pu['batch']}',
            if (pu['qty'] != null) 'Qty ${_num((pu['qty'] as num).toDouble())}',
            if (pu['mrp'] != null) 'MRP ${_rs(pu['mrp'])}',
            if (pu['bill_no'] != null && pu['bill_no'] != '') 'Bill ${pu['bill_no']}',
          ]),
          if (onLine)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text('Batch on this line',
                  style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: Colors.blue.shade800)),
            ),
        ]),
        right: _rateBlock(pu['rate']),
      );

  // --- boxes ---

  List<Widget> _partyChildren(Map<String, dynamic>? h, List<Map> points, List<Map> bills, List<Map> orders,
      Map<String, List<Map>> groups) {
    if (h == null || points.isEmpty) return [_empty('Never sold to this party before.')];
    final times = h['times'] ?? 0;
    return [
      Row(children: [
        _stat('Last rate', _rs(h['last']?['rate']), sub: _d(h['last']?['date']), color: Colors.blue.shade800),
        _stat('Average', _rs(h['avg_rate']), sub: '$times time${times == 1 ? '' : 's'}', color: Colors.blue.shade800),
      ]),
      if (h['min_rate'] != null) ...[
        const SizedBox(height: 6),
        Text(
          h['min_rate'] == h['max_rate']
              ? 'Always ${_rs(h['min_rate'])}'
              : 'Lowest ${_rs(h['min_rate'])}  ·  Highest ${_rs(h['max_rate'])}',
          style: TextStyle(fontSize: 12.5, color: Colors.grey.shade700),
        ),
      ],
      if (bills.isNotEmpty) ...[
        const SizedBox(height: 10),
        SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: false, label: Text('All sales')),
            ButtonSegment(value: true, label: Text('By batch')),
          ],
          selected: {_byBatch},
          showSelectedIcon: false,
          style: SegmentedButton.styleFrom(
            selectedBackgroundColor: _teal.withAlpha(35),
            selectedForegroundColor: Colors.black87,
            visualDensity: VisualDensity.compact,
          ),
          onSelectionChanged: (s) => setState(() => _byBatch = s.first),
        ),
        if (!_byBatch)
          ...bills.map((p) => _saleRow(p))
        else
          ...groups.entries.map((g) {
            final first = g.value.first;
            final onLine = g.key == _lineBatch;
            return Container(
              margin: const EdgeInsets.only(top: 10),
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: onLine ? Colors.blue.shade50 : Colors.grey.shade100,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Text('Batch ${g.key}', style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700)),
                  if (onLine) ...[
                    const SizedBox(width: 6),
                    Text('on this line',
                        style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: Colors.blue.shade800)),
                  ],
                ]),
                const SizedBox(height: 4),
                _tags([
                  if (first['expiry'] != null) 'Exp ${_d(first['expiry'])}',
                  if ((first['batch_mrp'] ?? first['mrp']) != null) 'MRP ${_rs(first['batch_mrp'] ?? first['mrp'])}',
                  if (first['purchase_rate'] != null) 'Bought ${_rs(first['purchase_rate'])}',
                ]),
                ...g.value.map((p) => _saleRow(p, showBatch: false)),
              ]),
            );
          }),
      ],
      if (orders.isNotEmpty) ...[
        _subhead('Earlier app orders (no batch)'),
        ...orders.map((p) => _saleRow(p)),
      ],
    ];
  }

  // the last 5 bills of the product to any party, and their average rate
  List<Widget> _recentChildren() {
    final r = _recent;
    if (r == null) {
      return const [
        Padding(padding: EdgeInsets.all(12), child: Center(child: CircularProgressIndicator(color: _teal)))
      ];
    }
    if (r.isEmpty) return [_empty('This product has not been sold to anyone this year.')];
    final rates = r.map((s) => (s['rate'] as num).toDouble()).toList();
    final avg = rates.reduce((a, b) => a + b) / rates.length;
    final lo = rates.reduce((a, b) => a < b ? a : b), hi = rates.reduce((a, b) => a > b ? a : b);
    return [
      Row(children: [
        _stat('Average of ${r.length}', _rs(avg), color: Colors.grey.shade800),
        _stat(lo == hi ? 'Rate' : 'Lowest – highest', lo == hi ? _rs(lo) : '${_rs(lo)} – ${_rs(hi)}',
            color: Colors.grey.shade800),
      ]),
      ...r.map(_recentRow),
    ];
  }

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
      Container(
        color: Colors.white,
        padding: const EdgeInsets.fromLTRB(16, 12, 4, 12),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Sales & purchase history', style: TextStyle(fontSize: 12.5, color: Colors.grey.shade600)),
              const SizedBox(height: 2),
              Text(widget.productName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              if (lineBatch != null)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text('Batch on this line: $lineBatch',
                      style: TextStyle(fontSize: 12.5, color: Colors.blue.shade800)),
                ),
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
                : ListView(padding: const EdgeInsets.fromLTRB(12, 4, 12, 24), children: [
                    // box 1: this party's history (open), box 2: the product's last 5 bills
                    // to any party (open instead when this party never bought it)
                    _foldBox(
                      'Sales to this party',
                      icon: Icons.storefront_outlined,
                      count: points.length,
                      open: _partyOpen ?? points.isNotEmpty,
                      onToggle: () => setState(() => _partyOpen = !(_partyOpen ?? points.isNotEmpty)),
                      color: Colors.blue.shade800,
                      children: _partyChildren(h, points, bills, orders, groups),
                    ),
                    _foldBox(
                      _recent == null || _recent!.isEmpty
                          ? 'Last 5 bills of ${widget.productName}'
                          : 'Last ${_recent!.length} bills of ${widget.productName}',
                      icon: Icons.receipt_long_outlined,
                      open: _anyOpen ?? points.isEmpty,
                      onToggle: () => setState(() => _anyOpen = !(_anyOpen ?? points.isEmpty)),
                      color: Colors.grey.shade800,
                      children: _recentChildren(),
                    ),
                    _foldBox(
                      // never sold to this party: the product's latest purchases instead
                      h?['purchases_latest'] == true ? 'Latest purchases of this product' : 'Purchases of these batches',
                      icon: Icons.local_shipping_outlined,
                      count: purchases.length + earlier.length,
                      open: _buyOpen ?? true,
                      onToggle: () => setState(() => _buyOpen = !(_buyOpen ?? true)),
                      color: Colors.amber.shade900,
                      children: [
                        if (purchases.isEmpty && earlier.isEmpty) _empty('No purchases found this financial year.'),
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
                            padding: const EdgeInsets.only(top: 8),
                            child: Text('No purchase found for $lineBatch, the batch on this line.',
                                style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                          ),
                      ],
                    ),
                  ]),
      ),
    ]);
  }
}
