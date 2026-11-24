import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../services/staff_service.dart';
import '../../widgets/shell_leading.dart';

const _teal = Color(0xFF00A6A4);
const _ink = Color(0xFF0F172A);
const _line = Color(0xFFE2E8F0);
const _cardEdge = Color(0xFFCBD5E1);
const _pageBg = Color(0xFFEEF1F5);
const _muted = Color(0xFF475569); // secondary text: darker than plain grey
const _price = Color(0xFF0F766E); // MRP, so it isn't read as a quantity
const _green = Color(0xFF15803D);
const _greenBg = Color(0xFFDCFCE7);
const _amber = Color(0xFFB45309);
const _amberBg = Color(0xFFFEF3C7);
const _red = Color(0xFFB91C1C);
const _redBg = Color(0xFFFEE2E2);
const _grey = Color(0xFF64748B);
const _greyBg = Color(0xFFF1F5F9);
const _orange = Color(0xFFC2410C);
const _orangeBg = Color(0xFFFFEDD5);

/// Marg stock, as on the website's Marg Stock page (marg_stock_view): each
/// product's total stock and its batches with expiry. Search by name or
/// code; quick filters for in stock / low stock / expired / negative, and
/// stock expiring within 1, 3, 6 or 9 months.
class MargStockScreen extends StatefulWidget {
  const MargStockScreen({super.key});

  @override
  State<MargStockScreen> createState() => _MargStockScreenState();
}

class _MargStockScreenState extends State<MargStockScreen> {
  final _service = StaffService();
  final _search = TextEditingController();
  Timer? _debounce;
  String _view = 'in_stock';
  int? _expiryMonths; // 1, 3, 6 or 9: stock expiring within that many months
  final List<StockProduct> _products = [];
  int _page = 1;
  bool _hasMore = false;
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;
  int _total = 0;
  int _req = 0; // ignores answers to an older search

  static const _views = [
    ('in_stock', 'In stock'),
    ('', 'All'),
    ('low', 'Low stock'),
    ('expired', 'Expired'),
    ('negative', 'Negative'),
  ];

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
      final page = await _service.stock(search: _search.text.trim(), view: _view, expiryMonths: _expiryMonths, page: more ? _page + 1 : 1);
      if (!mounted || req != _req) return;
      setState(() {
        if (!more) _products.clear();
        _products.addAll(page.products);
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

  String _qty(double v) => v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(2);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _pageBg,
      appBar: AppBar(leading: const ShellBack(), title: const Text('Marg Stock')),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
          child: TextField(
            controller: _search,
            onChanged: _onSearch,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: 'Search product name or code',
              prefixIcon: const Icon(Icons.search),
              isDense: true,
              filled: true,
              fillColor: Colors.white,
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _cardEdge)),
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
              for (final (k, l) in _views)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: ChoiceChip(
                    label: Text(l),
                    selected: _view == k,
                    selectedColor: _teal.withValues(alpha: 0.15),
                    backgroundColor: Colors.white,
                    side: BorderSide(color: _view == k ? _teal : _cardEdge),
                    labelStyle: TextStyle(
                        fontSize: 12.5,
                        fontWeight: _view == k ? FontWeight.w700 : FontWeight.w500,
                        color: _view == k ? const Color(0xFF00807E) : _ink),
                    onSelected: (_) {
                      setState(() => _view = k);
                      _load();
                    },
                  ),
                ),
            ],
          ),
        ),
        SizedBox(
          height: 40,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            children: [
              const Center(
                child: Padding(
                  padding: EdgeInsets.only(left: 4, right: 6),
                  child: Text('Expiring within', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: _muted)),
                ),
              ),
              for (final m in const [1, 3, 6, 9])
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: ChoiceChip(
                    label: Text('$m mon'),
                    selected: _expiryMonths == m,
                    showCheckmark: false,
                    selectedColor: _expiryColor(m).$1,
                    backgroundColor: Colors.white,
                    side: BorderSide(color: _expiryMonths == m ? _expiryColor(m).$1 : _cardEdge),
                    labelStyle: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                        color: _expiryMonths == m ? Colors.white : _expiryColor(m).$1),
                    // tap again to clear
                    onSelected: (_) {
                      setState(() => _expiryMonths = _expiryMonths == m ? null : m);
                      _load();
                    },
                  ),
                ),
            ],
          ),
        ),
        if (!_loading && _error == null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 2, 16, 4),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text('$_total product${_total == 1 ? '' : 's'}', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
            ),
          ),
        Expanded(child: _body()),
      ]),
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
    if (_products.isEmpty) return Center(child: Text('No products here.', style: TextStyle(color: Colors.grey.shade500)));
    return RefreshIndicator(
      color: _teal,
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.only(top: 2, bottom: 24),
        itemCount: _products.length + (_hasMore ? 1 : 0),
        itemBuilder: (context, i) {
          if (i == _products.length) {
            return Padding(
              padding: const EdgeInsets.all(16),
              child: Center(
                child: _loadingMore
                    ? const CircularProgressIndicator(color: _teal)
                    : OutlinedButton(onPressed: () => _load(more: true), child: const Text('Load more')),
              ),
            );
          }
          return _product(_products[i]);
        },
      ),
    );
  }

  // a product's state, worst first: what its stripe and stock pill show
  (Color, Color, String) _state(StockProduct p) {
    if (p.totalStock < 0 || p.negativeBatches > 0) return (_red, _redBg, 'Negative');
    if (p.totalStock == 0) return (_grey, _greyBg, 'Out of stock');
    if (p.expiredQty > 0) return (_red, _redBg, 'Has expired');
    if (p.expiringQty > 0) return (_amber, _amberBg, 'Expiring soon');
    return (_green, _greenBg, 'In stock');
  }

  // the colour for "expiring within m months", matching the batch pills
  (Color, Color) _expiryColor(int m) => switch (m) {
        1 => (_red, _redBg),
        3 => (_orange, _orangeBg),
        6 => (_amber, _amberBg),
        _ => (const Color(0xFF4D7C0F), const Color(0xFFECFCCB)),
      };

  // a batch's expiry, in bands so they're easy to tell apart: expired (solid
  // red), under 1 month, 3, 6, 9 months, or fine
  (Color, Color) _expiryColors(DateTime? e) {
    if (e == null) return (_grey, _greyBg);
    final now = DateTime.now();
    if (e.isBefore(now)) return (Colors.white, _red);
    for (final m in const [1, 3, 6, 9]) {
      if (e.isBefore(DateTime(now.year, now.month + m, now.day))) return _expiryColor(m);
    }
    return (_green, _greenBg);
  }

  Widget _pill(String text, Color fg, Color bg, {double size = 11.5, FontWeight weight = FontWeight.w600}) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
        child: Text(text, style: TextStyle(fontSize: size, fontWeight: weight, color: fg)),
      );

  Widget _product(StockProduct p) {
    final (color, bg, label) = _state(p);
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 5, 12, 5),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _cardEdge),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 4, offset: const Offset(0, 1))],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(children: [
        Positioned(left: 0, top: 0, bottom: 0, child: Container(width: 6, color: color)),
        Padding(
          padding: const EdgeInsets.only(left: 6),
          child: Theme(
            // no ExpansionTile divider lines: the card has its own border
            data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
            child: ExpansionTile(
              tilePadding: const EdgeInsets.fromLTRB(12, 4, 10, 4),
              childrenPadding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
              title: Text(p.name.isEmpty ? 'Product ${p.pid}' : p.name,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5, color: _ink)),
              subtitle: Padding(
                padding: const EdgeInsets.only(top: 5),
                child: Wrap(spacing: 6, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                  if (p.code.isNotEmpty)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                      decoration: BoxDecoration(
                        color: const Color(0xFFEEF2FF),
                        borderRadius: BorderRadius.circular(4),
                        border: Border.all(color: const Color(0xFFC7D2FE)),
                      ),
                      child: Text(p.code,
                          style: const TextStyle(
                              fontFamily: 'monospace', fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF3730A3))),
                    ),
                  _pill(label, color, bg, size: 11),
                  Text(
                    [if (p.company.isNotEmpty) p.company, '${p.batchCount} batch${p.batchCount == 1 ? '' : 'es'}'].join('  ·  '),
                    style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w500, color: _muted),
                  ),
                ]),
              ),
              trailing: Container(
                constraints: const BoxConstraints(minWidth: 56),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Text(_qty(p.totalStock), style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: color)),
                  Text(p.unit.isEmpty ? 'stock' : p.unit, style: TextStyle(fontSize: 10, color: color.withValues(alpha: 0.8))),
                ]),
              ),
              children: [_batchTable(p.batches)],
            ),
          ),
        ),
      ]),
    );
  }

  Widget _batchTable(List<StockBatch> batches) {
    if (batches.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(8),
        child: Text('No batches.', style: TextStyle(color: Colors.grey.shade500, fontSize: 12)),
      );
    }
    final fmt = DateFormat('MMM yyyy');
    const head = TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Color(0xFF334155), letterSpacing: 0.4);
    Widget row(List<Widget> cells, {Color? color, bool top = false}) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: color,
            border: top ? null : const Border(top: BorderSide(color: _line)),
          ),
          child: Row(children: [
            Expanded(flex: 4, child: cells[0]),
            Expanded(flex: 4, child: cells[1]),
            Expanded(flex: 3, child: Align(alignment: Alignment.centerRight, child: cells[2])),
            Expanded(flex: 3, child: Align(alignment: Alignment.centerRight, child: cells[3])),
          ]),
        );
    return Container(
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(8), border: Border.all(color: _cardEdge)),
      clipBehavior: Clip.antiAlias,
      child: Column(children: [
        row(const [Text('BATCH', style: head), Text('EXPIRY', style: head), Text('MRP', style: head), Text('QTY', style: head)],
            color: const Color(0xFFE2E8F0), top: true),
        for (var i = 0; i < batches.length; i++)
          () {
            final b = batches[i];
            final (ec, ebg) = _expiryColors(b.expiry);
            return row([
              Text(b.batch.isEmpty ? '(no batch)' : b.batch,
                  style: const TextStyle(fontFamily: 'monospace', fontSize: 12.5, fontWeight: FontWeight.w600, color: _ink)),
              Align(
                alignment: Alignment.centerLeft,
                child: b.expiry == null
                    ? Text('—', style: TextStyle(color: Colors.grey.shade500))
                    : _pill(fmt.format(b.expiry!), ec, ebg, size: 11),
              ),
              Text(b.mrp == null ? '—' : '₹${b.mrp!.toStringAsFixed(2)}',
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: _price)),
              Text(_qty(b.stock), style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: b.stock < 0 ? _red : _ink)),
            ], color: i.isOdd ? const Color(0xFFF8FAFC) : Colors.white);
          }(),
      ]),
    );
  }
}
