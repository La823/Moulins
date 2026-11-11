import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../services/bills_service.dart';
import '../../services/retailer_service.dart';

/// Partner: their invoices from Marg this financial year (final bills, not
/// app orders), with the year's total; tap one for its lines. Like the
/// website's partner panel Bills page.
class MyBillsScreen extends StatefulWidget {
  const MyBillsScreen({super.key});

  @override
  State<MyBillsScreen> createState() => _MyBillsScreenState();
}

const _teal = Color(0xFF00A6A4);
final _money = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 2);
final _qty = NumberFormat.decimalPattern('en_IN');
String _rs(dynamic v) => v == null ? '-' : _money.format((v as num).toDouble());
DateTime? _date(dynamic v) => DateTime.tryParse(v?.toString() ?? '');

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
    final bills = (d?['bills'] as List? ?? []).cast<Map>();
    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: Colors.black,
        title: const Text('My Bills', style: TextStyle(fontWeight: FontWeight.w600)),
      ),
      body: RefreshIndicator(
        color: _teal,
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.fromLTRB(14, 12, 14, 24), children: [
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
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: _teal.withAlpha(20), borderRadius: BorderRadius.circular(14)),
              child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Billed this year, with GST', style: TextStyle(fontSize: 12.5, color: Colors.grey.shade700)),
                    const SizedBox(height: 4),
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Text(_rs(d['total']),
                          style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: _teal)),
                    ),
                  ]),
                ),
                Text('${d['count'] ?? bills.length} invoice${(d['count'] ?? bills.length) == 1 ? '' : 's'}',
                    style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
              ]),
            ),
            const SizedBox(height: 6),
            ...bills.map((b) => _BillCard(bill: b)),
          ],
        ]),
      ),
    );
  }

  Widget _note(String text, {Color? color}) => Container(
        margin: const EdgeInsets.only(top: 8),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.grey.shade200)),
        child: Text(text, style: TextStyle(fontSize: 14, color: color ?? Colors.grey.shade700, height: 1.4)),
      );
}

class _BillCard extends StatelessWidget {
  final Map bill;
  const _BillCard({required this.bill});

  @override
  Widget build(BuildContext context) {
    final t = _date(bill['date']);
    final items = bill['items'] ?? 0;
    return Container(
      margin: const EdgeInsets.only(top: 8),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => _BillDetailScreen(bill: bill))),
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200)),
            child: Row(children: [
              SizedBox(
                width: 54,
                child: t == null
                    ? const SizedBox()
                    : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(DateFormat('d MMM').format(t),
                            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                        Text(DateFormat('yyyy').format(t), style: TextStyle(fontSize: 11.5, color: Colors.grey.shade500)),
                      ]),
              ),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Invoice ${bill['bill_no'] ?? ''}',
                      style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 3),
                  Text('$items item${items == 1 ? '' : 's'} · ${_rs(bill['amount'])} + GST ${_rs(bill['gst'])}',
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                ]),
              ),
              const SizedBox(width: 8),
              Text(_rs(bill['total']), style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700)),
              Icon(Icons.chevron_right, color: Colors.grey.shade400),
            ]),
          ),
        ),
      ),
    );
  }
}

class _BillDetailScreen extends StatefulWidget {
  final Map bill;
  const _BillDetailScreen({required this.bill});

  @override
  State<_BillDetailScreen> createState() => _BillDetailScreenState();
}

class _BillDetailScreenState extends State<_BillDetailScreen> {
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

  Widget _tag(String s, {Color? color}) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(color: Colors.grey.shade100, borderRadius: BorderRadius.circular(5)),
        child: Text(s, style: TextStyle(fontSize: 11.5, color: color ?? Colors.grey.shade800)),
      );

  Widget _line(Map l) {
    final isItem = l['kind'] == 'item';
    final qty = (l['qty'] as num?)?.toDouble() ?? 0, free = (l['free'] as num?)?.toDouble() ?? 0;
    final gstPct = l['gst_percent'] as num?;
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
          color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Text('${l['product'] ?? '-'}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          ),
          const SizedBox(width: 8),
          Text(_rs(l['line_total']), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
        ]),
        const SizedBox(height: 6),
        Wrap(spacing: 4, runSpacing: 4, children: [
          if (isItem) _tag('Qty ${_qty.format(qty)}'),
          if (isItem && free > 0) _tag('+${_qty.format(free)} free', color: Colors.green.shade800),
          if (isItem && (l['rate'] as num?) != null) _tag('Rate ${_rs(l['rate'])}'),
          if (isItem && (l['mrp'] as num?) != null) _tag('MRP ${_rs(l['mrp'])}'),
          if (isItem && (l['batch'] ?? '').toString().isNotEmpty) _tag('Batch ${l['batch']}'),
          if (isItem && _expiry(l['expiry']).isNotEmpty) _tag('Exp ${_expiry(l['expiry'])}'),
          if ((l['discount'] as num? ?? 0) != 0) _tag('Disc ${_rs(l['discount'])}'),
        ]),
        const SizedBox(height: 6),
        Text(
          'Amount ${_rs(l['amount'])}  ·  GST ${_rs(l['gst_amount'])}'
          '${gstPct != null ? ' (${_qty.format(gstPct)}%)' : ''}',
          style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
        ),
      ]),
    );
  }

  Widget _totalRow(String label, String value, {bool bold = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(children: [
          Text(label, style: TextStyle(fontSize: bold ? 15 : 13, fontWeight: bold ? FontWeight.w700 : null)),
          const Spacer(),
          Text(value, style: TextStyle(fontSize: bold ? 16 : 13, fontWeight: bold ? FontWeight.w700 : FontWeight.w500)),
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
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
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
              : ListView(padding: const EdgeInsets.fromLTRB(14, 6, 14, 24), children: [
                  ...lines.map(_line),
                  Container(
                    margin: const EdgeInsets.only(top: 12),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(color: _teal.withAlpha(20), borderRadius: BorderRadius.circular(12)),
                    child: Column(children: [
                      _totalRow('Amount', _rs(b['amount'])),
                      _totalRow('GST', _rs(b['gst'])),
                      if (roundOff.abs() >= 0.01) _totalRow('Round off / other', _rs(roundOff)),
                      const Divider(),
                      _totalRow('Invoice total', _rs(total), bold: true),
                    ]),
                  ),
                ]),
    );
  }
}
