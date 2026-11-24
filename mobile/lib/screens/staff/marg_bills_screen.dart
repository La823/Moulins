import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:open_filex/open_filex.dart';
import '../../services/staff_service.dart';
import '../../widgets/shell_leading.dart';

const _teal = Color(0xFF00A6A4);
const _ink = Color(0xFF0F172A);
const _cardEdge = Color(0xFFCBD5E1);
const _pageBg = Color(0xFFEEF1F5);
const _muted = Color(0xFF475569);
const _red = Color(0xFFB91C1C);
const _redBg = Color(0xFFFEE2E2);

final _money = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 2);
final _day = DateFormat('d MMM yyyy');

String _qty(double v) => v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(2);

// a voucher type's colour, so sales, challans and purchases stand apart
(Color, Color) _typeColors(String t) => switch (t) {
      'S' => (const Color(0xFF15803D), const Color(0xFFDCFCE7)),
      'CH' => (const Color(0xFF1D4ED8), const Color(0xFFDBEAFE)),
      'P' => (const Color(0xFF6D28D9), const Color(0xFFEDE9FE)),
      'R' || 'B' => (const Color(0xFFC2410C), const Color(0xFFFFEDD5)),
      _ => (_muted, const Color(0xFFF1F5F9)),
    };

Widget _pill(String text, Color fg, Color bg) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
      child: Text(text, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: fg)),
    );

/// Marg bills, as on the website's Marg Bills page (GET /admin/marg-bills):
/// every voucher this financial year, newest first. Admins, and employees
/// with the "Marg Bills (View)" permission (the side menu checks it).
class MargBillsScreen extends StatefulWidget {
  const MargBillsScreen({super.key});

  @override
  State<MargBillsScreen> createState() => _MargBillsScreenState();
}

class _MargBillsScreenState extends State<MargBillsScreen> {
  final _service = StaffService();
  final _search = TextEditingController();
  Timer? _debounce;
  String _type = '';
  final List<MargBill> _bills = [];
  List<MargBillType> _types = [];
  int _page = 1;
  bool _hasMore = false;
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;
  int _total = 0;
  int _req = 0; // ignores answers to an older search

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  Future<void> _load({bool more = false}) async {
    final req = ++_req;
    setState(() {
      if (more) {
        _loadingMore = true;
      } else {
        _loading = true;
        _error = null;
      }
    });
    try {
      final page = await _service.margBills(search: _search.text.trim(), type: _type, page: more ? _page + 1 : 1);
      if (!mounted || req != _req) return;
      setState(() {
        if (!more) _bills.clear();
        _bills.addAll(page.bills);
        _types = page.types;
        _page = page.page;
        _hasMore = page.hasMore;
        _total = page.total;
      });
    } catch (e) {
      if (mounted && req == _req) setState(() => _error = staffError(e));
    } finally {
      if (mounted && req == _req) setState(() => (_loading = false, _loadingMore = false));
    }
  }

  void _onSearch(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), _load);
  }

  @override
  Widget build(BuildContext context) {
    final all = _types.fold<int>(0, (n, t) => n + t.count);
    return Scaffold(
      backgroundColor: _pageBg,
      appBar: AppBar(leading: const ShellBack(), title: const Text('Marg Bills')),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
          child: TextField(
            controller: _search,
            onChanged: _onSearch,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: 'Bill no, party or product',
              prefixIcon: const Icon(Icons.search),
              isDense: true,
              filled: true,
              fillColor: Colors.white,
              enabledBorder:
                  OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _cardEdge)),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              suffixIcon: _search.text.isEmpty
                  ? null
                  : IconButton(
                      icon: const Icon(Icons.clear),
                      onPressed: () {
                        _search.clear();
                        _load();
                      }),
            ),
          ),
        ),
        SizedBox(
          height: 44,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            children: [
              _typeChip('', 'All', all),
              for (final t in _types) _typeChip(t.code, t.name, t.count),
            ],
          ),
        ),
        if (!_loading && _error == null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 2, 16, 4),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text('$_total bill${_total == 1 ? '' : 's'}',
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: _muted)),
            ),
          ),
        Expanded(child: _body()),
      ]),
    );
  }

  Widget _typeChip(String code, String label, int count) {
    final on = _type == code;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: ChoiceChip(
        label: Text('$label  $count'),
        selected: on,
        showCheckmark: false,
        selectedColor: _teal.withValues(alpha: 0.15),
        backgroundColor: Colors.white,
        side: BorderSide(color: on ? _teal : _cardEdge),
        labelStyle:
            TextStyle(fontSize: 12.5, fontWeight: on ? FontWeight.w700 : FontWeight.w500, color: on ? const Color(0xFF00807E) : _ink),
        onSelected: (_) {
          setState(() => _type = code);
          _load();
        },
      ),
    );
  }

  Widget _body() {
    if (_loading) return const Center(child: CircularProgressIndicator(color: _teal));
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(_error!, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: _load, child: const Text('Try again')),
          ]),
        ),
      );
    }
    if (_bills.isEmpty) return const Center(child: Text('No bills here.', style: TextStyle(color: _muted)));
    return RefreshIndicator(
      color: _teal,
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.only(top: 2, bottom: 24),
        itemCount: _bills.length + (_hasMore ? 1 : 0),
        itemBuilder: (context, i) {
          if (i == _bills.length) {
            return Padding(
              padding: const EdgeInsets.all(16),
              child: Center(
                child: _loadingMore
                    ? const CircularProgressIndicator(color: _teal)
                    : OutlinedButton(onPressed: () => _load(more: true), child: const Text('Load more')),
              ),
            );
          }
          return _row(_bills[i]);
        },
      ),
    );
  }

  Widget _row(MargBill b) {
    final (fg, bg) = _typeColors(b.type);
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 5, 12, 5),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () => context.push('/staff/bills/${b.voucher}'),
          child: Container(
            padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(12), border: Border.all(color: _cardEdge)),
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(b.party.isEmpty ? 'No party' : b.party,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 14.5,
                          color: _ink,
                          decoration: b.cancelled ? TextDecoration.lineThrough : null)),
                  const SizedBox(height: 5),
                  Wrap(spacing: 6, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                    _pill(b.typeName, fg, bg),
                    if (b.cancelled) _pill('Cancelled', _red, _redBg),
                    Text(b.billNo,
                        style: const TextStyle(
                            fontFamily: 'monospace', fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF3730A3))),
                    Text([if (b.date != null) _day.format(b.date!), '${b.lines} line${b.lines == 1 ? '' : 's'}'].join('  ·  '),
                        style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w500, color: _muted)),
                  ]),
                ]),
              ),
              const SizedBox(width: 8),
              _BillPdfButton(voucher: b.voucher),
              Text(_money.format(b.total),
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: b.cancelled ? _muted : _ink)),
              const Icon(Icons.chevron_right, color: _muted),
            ]),
          ),
        ),
      ),
    );
  }
}

/// One Marg bill with its lines.
class MargBillDetailScreen extends StatefulWidget {
  final int voucher;
  const MargBillDetailScreen({super.key, required this.voucher});

  @override
  State<MargBillDetailScreen> createState() => _MargBillDetailScreenState();
}

class _MargBillDetailScreenState extends State<MargBillDetailScreen> {
  MargBillDetail? _bill;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final d = await StaffService().margBill(widget.voucher);
      if (mounted) setState(() => _bill = d);
    } catch (e) {
      if (mounted) setState(() => _error = staffError(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = _bill;
    return Scaffold(
      backgroundColor: _pageBg,
      appBar: AppBar(
        title: Text(d == null ? 'Bill' : d.bill.billNo),
        actions: [_BillPdfButton(voucher: widget.voucher, label: true), const SizedBox(width: 6)],
      ),
      body: d == null
          ? Center(
              child: _error == null
                  ? const CircularProgressIndicator(color: _teal)
                  : Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        Text(_error!, textAlign: TextAlign.center),
                        const SizedBox(height: 12),
                        OutlinedButton(onPressed: _load, child: const Text('Try again')),
                      ]),
                    ))
          : ListView(padding: const EdgeInsets.all(12), children: [
              _header(d),
              const SizedBox(height: 10),
              for (final l in d.lines) _line(l),
              _totals(d),
            ]),
    );
  }

  Widget _box(Widget child) => Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: _cardEdge)),
        child: child,
      );

  Widget _header(MargBillDetail d) {
    final b = d.bill;
    final (fg, bg) = _typeColors(b.type);
    const label = TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: _muted);
    return _box(Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(b.party.isEmpty ? 'No party' : b.party, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: _ink)),
      if (b.partyCode.isNotEmpty) Text(b.partyCode, style: label),
      const SizedBox(height: 8),
      Wrap(spacing: 6, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
        _pill(b.typeName, fg, bg),
        if (b.cancelled) _pill('Cancelled', _red, _redBg),
        if (b.date != null) Text(_day.format(b.date!), style: label),
      ]),
      if (d.salesman != null || d.area != null) ...[
        const SizedBox(height: 6),
        Text([if (d.salesman != null) 'Salesman: ${d.salesman}', if (d.area != null) 'Area: ${d.area}'].join('  ·  '),
            style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Color(0xFF1D4ED8))),
      ],
      if (b.orderRefs != null) ...[
        const SizedBox(height: 4),
        Text('Order: ${b.orderRefs}', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Color(0xFF6D28D9))),
      ],
      if (d.fromChallans.isNotEmpty) ...[
        const SizedBox(height: 4),
        Text('From challan ${d.fromChallans.join(', ')}', style: label),
      ],
    ]));
  }

  Widget _line(MargBillLine l) {
    final fmt = DateFormat('MMM yyyy');
    return _box(Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(child: Text(l.product, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: _ink))),
        const SizedBox(width: 8),
        Text(_money.format(l.lineTotal), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: _ink)),
      ]),
      if (l.kind != 'charge') ...[
        const SizedBox(height: 6),
        Wrap(spacing: 10, runSpacing: 4, children: [
          Text('Qty ${_qty(l.qty)}${l.free > 0 ? ' + ${_qty(l.free)} free' : ''}',
              style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: _ink)),
          if (l.batch != null)
            Text('Batch ${l.batch}',
                style: const TextStyle(fontFamily: 'monospace', fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF3730A3))),
          if (l.expiry != null)
            Text('Exp ${fmt.format(l.expiry!)}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFFB45309))),
        ]),
        const SizedBox(height: 4),
        Wrap(spacing: 10, runSpacing: 4, children: [
          if (l.rate != null) Text('Rate ${_money.format(l.rate)}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF0F766E))),
          if (l.mrp != null) Text('MRP ${_money.format(l.mrp)}', style: const TextStyle(fontSize: 12, color: _muted)),
          if (l.discount > 0) Text('Disc ${_qty(l.discount)}%', style: const TextStyle(fontSize: 12, color: _muted)),
          if (l.gstPercent > 0)
            Text('GST ${_qty(l.gstPercent)}% ${_money.format(l.gstAmount)}', style: const TextStyle(fontSize: 12, color: _muted)),
        ]),
      ],
    ]));
  }

  Widget _totals(MargBillDetail d) {
    final gst = d.lines.fold<double>(0, (s, l) => s + l.gstAmount);
    Widget row(String k, String v, {bool bold = false}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(children: [
            Expanded(child: Text(k, style: TextStyle(fontSize: bold ? 14.5 : 13, fontWeight: bold ? FontWeight.w800 : FontWeight.w500, color: bold ? _ink : _muted))),
            Text(v, style: TextStyle(fontSize: bold ? 16 : 13, fontWeight: bold ? FontWeight.w800 : FontWeight.w600, color: _ink)),
          ]),
        );
    return _box(Column(children: [
      row('${d.lines.length} line${d.lines.length == 1 ? '' : 's'}', ''),
      if (gst > 0) row('GST', _money.format(gst)),
      row('Bill total', _money.format(d.bill.total), bold: true),
    ]));
  }
}

/// Opens a printable PDF of the bill (company, party, lines, GST, total; a
/// copy for reference, not a tax invoice) in the phone's PDF viewer.
class _BillPdfButton extends StatefulWidget {
  final int voucher;
  final bool label;
  const _BillPdfButton({required this.voucher, this.label = false});

  @override
  State<_BillPdfButton> createState() => _BillPdfButtonState();
}

class _BillPdfButtonState extends State<_BillPdfButton> {
  bool _busy = false;

  Future<void> _open() async {
    if (_busy) return;
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final file = await StaffService().margBillPdf(widget.voucher);
      final res = await OpenFilex.open(file.path, type: 'application/pdf');
      if (res.type != ResultType.done) {
        messenger.showSnackBar(SnackBar(content: Text(res.message.isNotEmpty ? res.message : 'The PDF could not be opened.')));
      }
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(staffError(e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final icon = _busy
        ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: _teal))
        : const Icon(Icons.picture_as_pdf_outlined, size: 20, color: _teal);
    if (widget.label) {
      return TextButton.icon(onPressed: _busy ? null : _open, icon: icon, label: const Text('PDF', style: TextStyle(color: _teal)));
    }
    return IconButton(onPressed: _busy ? null : _open, icon: icon, tooltip: 'Bill PDF', visualDensity: VisualDensity.compact);
  }
}
