import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../services/bills_service.dart';
import '../../services/retailer_service.dart';
import '../../widgets/shell_leading.dart';

/// Partner: their invoices from Marg this financial year (final bills, not
/// app orders), with the year's total, grouped by month; tap one for its
/// lines. Like the website's partner panel Bills page.
class MyBillsScreen extends StatefulWidget {
  const MyBillsScreen({super.key});

  @override
  State<MyBillsScreen> createState() => _MyBillsScreenState();
}

const _teal = Color(0xFF00A6A4);
const _tealDark = Color(0xFF00807E);
const _ink = Color(0xFF1A1A1A);
const _page = Color(0xFFF6F7F8);
const _border = Color(0xFFE8EAED);
const _rule = Color(0xFFF0F1F3);
final _money = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 2);
final _qty = NumberFormat.decimalPattern('en_IN');
String _rs(dynamic v) => v == null ? '-' : _money.format((v as num).toDouble());
DateTime? _date(dynamic v) => DateTime.tryParse(v?.toString() ?? '');

// one white card, its rows split by thin lines
Widget _card(List<Widget> rows, {EdgeInsets margin = EdgeInsets.zero}) => Container(
      margin: margin,
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

class _MyBillsScreenState extends State<MyBillsScreen> {
  Map<String, dynamic>? _data;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final d = await BillsService().myBills();
      if (mounted) {
        setState(() {
          _data = d;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = RetailerService.messageOf(e, fallback: 'Your bills could not be loaded.'));
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    final bills = (d?['bills'] as List? ?? []).cast<Map>().toList()
      ..sort((a, b) => (b['date']?.toString() ?? '').compareTo(a['date']?.toString() ?? ''));
    return Scaffold(
      backgroundColor: _page,
      appBar: AppBar(leading: const ShellBack(), 
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: Colors.black,
        title: const Text('My Bills', style: TextStyle(fontWeight: FontWeight.w600)),
      ),
      body: RefreshIndicator(
        color: _teal,
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 28), children: [
          if (_error != null && d == null)
            _note(_error!, color: Colors.red.shade700)
          else if (d == null)
            const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator(color: _teal)))
          else if (d['linked'] != true)
            _note('Your bills will show here once your account is linked to our billing. '
                'Please contact us if you expected to see them.')
          else if (bills.isEmpty)
            _note('No invoices this financial year yet.')
          else ...[
            _summary(d, bills.length),
            ..._months(bills),
          ],
        ]),
      ),
    );
  }

  Widget _summary(Map d, int n) {
    final count = d['count'] ?? n;
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [_teal, _tealDark], begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Billed this financial year', style: TextStyle(fontSize: 13, color: Colors.white70)),
        const SizedBox(height: 6),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(_rs(d['total']),
              style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: Colors.white, letterSpacing: -0.5)),
        ),
        const SizedBox(height: 2),
        Text('$count invoice${count == 1 ? '' : 's'}, with GST', style: const TextStyle(fontSize: 12.5, color: Colors.white70)),
      ]),
    );
  }

  // bills, newest first, in one card per month with the month's total
  List<Widget> _months(List<Map> bills) {
    final out = <Widget>[];
    String? key;
    var group = <Map>[];
    void flush() {
      if (group.isEmpty) return;
      final t = _date(group.first['date']);
      final sum = group.fold<double>(0, (s, b) => s + ((b['total'] as num?)?.toDouble() ?? 0));
      out.add(Padding(
        padding: const EdgeInsets.fromLTRB(4, 22, 4, 8),
        child: Row(children: [
          Expanded(
            child: Text(t == null ? 'Other' : DateFormat('MMMM yyyy').format(t),
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: _ink)),
          ),
          Text(_rs(sum), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.grey.shade600)),
        ]),
      ));
      out.add(_card([for (final b in group) _BillRow(bill: b)]));
      group = [];
    }

    for (final b in bills) {
      final t = _date(b['date']);
      final k = t == null ? '' : DateFormat('yyyy-MM').format(t);
      if (k != key) {
        flush();
        key = k;
      }
      group.add(b);
    }
    flush();
    return out;
  }

  Widget _note(String text, {Color? color}) => _card(
        [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(text, style: TextStyle(fontSize: 14, color: color ?? Colors.grey.shade700, height: 1.4)),
          ),
        ],
        margin: const EdgeInsets.only(top: 8),
      );
}

class _BillRow extends StatelessWidget {
  final Map bill;
  const _BillRow({required this.bill});

  @override
  Widget build(BuildContext context) {
    final t = _date(bill['date']);
    final items = bill['items'] ?? 0;
    return InkWell(
      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => BillDetailScreen(bill: bill))),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
        child: Row(children: [
          Container(
            width: 44,
            padding: const EdgeInsets.symmetric(vertical: 5),
            decoration: BoxDecoration(color: _teal.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(10)),
            child: t == null
                ? const SizedBox(height: 30)
                : Column(children: [
                    Text(DateFormat('d').format(t),
                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: _tealDark, height: 1.1)),
                    Text(DateFormat('MMM').format(t).toUpperCase(),
                        style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: _tealDark, letterSpacing: 0.4)),
                  ]),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Invoice ${bill['bill_no'] ?? ''}', style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: _ink)),
              const SizedBox(height: 2),
              Text('$items item${items == 1 ? '' : 's'}', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
            ]),
          ),
          const SizedBox(width: 8),
          Text(_rs(bill['total']), style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: _ink)),
          Icon(Icons.chevron_right, color: Colors.grey.shade400, size: 20),
        ]),
      ),
    );
  }
}

/// One invoice: its products in one card, then the totals. Opened from My
/// Bills and from the dashboard's recent bills.
class BillDetailScreen extends StatefulWidget {
  final Map bill;
  const BillDetailScreen({super.key, required this.bill});

  @override
  State<BillDetailScreen> createState() => _BillDetailScreenState();
}

class _BillDetailScreenState extends State<BillDetailScreen> {
  Map<String, dynamic>? _detail;
  String? _error;

  @override
  void initState() {
    super.initState();
    BillsService().myBill((widget.bill['voucher'] as num).toInt()).then((d) {
      if (mounted) setState(() => _detail = d);
    }).catchError((e) {
      if (mounted) setState(() => _error = RetailerService.messageOf(e, fallback: 'The invoice could not be loaded.'));
    });
  }

  String _expiry(dynamic v) {
    final s = v?.toString() ?? '';
    return s.length >= 7 ? '${s.substring(5, 7)}/${s.substring(2, 4)}' : '';
  }

  // product and amount on top; qty, rate and batch on one quiet line under it
  Widget _line(Map l) {
    final isItem = l['kind'] == 'item';
    final qty = (l['qty'] as num?)?.toDouble() ?? 0, free = (l['free'] as num?)?.toDouble() ?? 0;
    final gstPct = l['gst_percent'] as num?;
    final batch = (l['batch'] ?? '').toString();
    final exp = _expiry(l['expiry']);
    final details = <String>[
      if (isItem) '${_qty.format(qty)} × ${_rs(l['rate'])}',
      if (isItem && (l['mrp'] as num?) != null) 'MRP ${_rs(l['mrp'])}',
      if ((l['discount'] as num? ?? 0) != 0) 'Disc ${_rs(l['discount'])}',
      'GST ${_rs(l['gst_amount'])}${gstPct != null ? ' (${_qty.format(gstPct)}%)' : ''}',
    ];
    final batchLine = [if (batch.isNotEmpty) 'Batch $batch', if (exp.isNotEmpty) 'Exp $exp'].join('  ·  ');
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Text('${l['product'] ?? '-'}', style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: _ink)),
          ),
          const SizedBox(width: 10),
          Text(_rs(l['line_total']), style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: _ink)),
        ]),
        const SizedBox(height: 3),
        Text.rich(
          TextSpan(children: [
            TextSpan(text: details.join('  ·  ')),
            if (isItem && free > 0)
              TextSpan(
                text: '  ·  +${_qty.format(free)} free',
                style: TextStyle(color: Colors.green.shade700, fontWeight: FontWeight.w600),
              ),
          ]),
          style: TextStyle(fontSize: 12, color: Colors.grey.shade600, height: 1.35),
        ),
        if (batchLine.isNotEmpty)
          Text(batchLine, style: TextStyle(fontSize: 12, color: Colors.grey.shade500, height: 1.35)),
      ]),
    );
  }

  Widget _totalRow(String label, String value, {bool bold = false}) => Padding(
        padding: EdgeInsets.symmetric(vertical: bold ? 4 : 3),
        child: Row(children: [
          Text(label,
              style: TextStyle(
                  fontSize: bold ? 15 : 13.5, fontWeight: bold ? FontWeight.w700 : null, color: bold ? _ink : Colors.grey.shade700)),
          const Spacer(),
          Text(value,
              style: TextStyle(fontSize: bold ? 17 : 13.5, fontWeight: bold ? FontWeight.w700 : FontWeight.w500, color: bold ? _tealDark : _ink)),
        ]),
      );

  @override
  Widget build(BuildContext context) {
    final b = widget.bill;
    final total = (b['total'] as num?)?.toDouble() ?? 0;
    final lines = (_detail?['lines'] as List? ?? []).cast<Map>();
    final lineSum = lines.fold<double>(0, (s, l) => s + ((l['line_total'] as num?)?.toDouble() ?? 0));
    final roundOff = total - lineSum;
    final t = _date(b['date']);
    return Scaffold(
      backgroundColor: _page,
      appBar: AppBar(leading: const ShellBack(), 
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: Colors.black,
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Invoice ${b['bill_no'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 17)),
          if (t != null)
            Text(DateFormat('d MMM yyyy').format(t), style: TextStyle(fontSize: 12.5, color: Colors.grey.shade600)),
        ]),
      ),
      body: _error != null
          ? Padding(padding: const EdgeInsets.all(20), child: Text(_error!, style: TextStyle(color: Colors.red.shade700)))
          : _detail == null
              ? const Center(child: CircularProgressIndicator(color: _teal))
              : ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 28), children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(4, 4, 4, 8),
                    child: Text('${lines.length} line${lines.length == 1 ? '' : 's'}',
                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: _ink)),
                  ),
                  _card(lines.map(_line).toList()),
                  _card(
                    [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                        child: Column(children: [
                          _totalRow('Amount', _rs(b['amount'])),
                          _totalRow('GST', _rs(b['gst'])),
                          if (roundOff.abs() >= 0.01) _totalRow('Round off / other', _rs(roundOff)),
                          const Divider(height: 18, color: _rule),
                          _totalRow('Invoice total', _rs(total), bold: true),
                        ]),
                      ),
                    ],
                    margin: const EdgeInsets.only(top: 14),
                  ),
                ]),
    );
  }
}
