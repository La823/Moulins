import 'dart:async';
import 'dart:typed_data';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:open_filex/open_filex.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../models/product.dart';
import '../../models/staff_order.dart';
import '../../models/transport.dart';
import '../../models/transport_mode.dart';
import '../../providers/auth_provider.dart';
import '../../services/admin_order_service.dart';
import '../../services/product_service.dart';
import '../../services/retailer_service.dart';
import '../../services/transport_service.dart';
import '../../widgets/product_history_panel.dart';
import 'admin_orders_screen.dart';

/// Staff: one order, as on the website's order page: the party, each line's
/// quantity, batch, rate and amount, freight and total, its status, photos,
/// the WhatsApp message and PDF, and Send to Marg. Seeing needs
/// orders_view; changing lines, rates, batches, status or photos and sending
/// to Marg needs orders_edit (the server checks too). Lines already in Marg
/// can't be changed.
class AdminOrderDetailScreen extends ConsumerStatefulWidget {
  final String orderId;
  const AdminOrderDetailScreen({super.key, required this.orderId});

  @override
  ConsumerState<AdminOrderDetailScreen> createState() => _AdminOrderDetailScreenState();
}

class _AdminOrderDetailScreenState extends ConsumerState<AdminOrderDetailScreen> {
  static const _teal = Color(0xFF00A6A4);
  final _service = AdminOrderService();
  final _money = NumberFormat.decimalPattern('en_IN');
  StaffOrder? _order;
  String? _error;
  bool _busy = false;
  final Map<String, TextEditingController> _rates = {};
  final _freightCtrl = TextEditingController();

  bool get _canEdit {
    final u = ref.read(authProvider).user;
    return u != null && (u.role == 'admin' || u.permissions.contains('orders_edit'));
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in _rates.values) {
      c.dispose();
    }
    _freightCtrl.dispose();
    super.dispose();
  }

  String _fmt(double? v) => v == null ? '' : (v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(2));

  Future<void> _load() async {
    try {
      final o = await _service.get(widget.orderId);
      if (!mounted) return;
      setState(() {
        _order = o;
        _error = null;
        for (final it in o.items) {
          (_rates[it.id] ??= TextEditingController()).text = _fmt(it.rate);
        }
        _freightCtrl.text = _fmt(o.freight);
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

  Future<void> _saveRates() async {
    final o = _order!;
    final rates = <String, double?>{};
    for (final it in o.items) {
      final txt = _rates[it.id]!.text.trim();
      final v = txt.isEmpty ? null : double.tryParse(txt);
      if (txt.isNotEmpty && (v == null || v < 0)) {
        _snack('Please enter a valid rate for ${it.productName}.', error: true);
        return;
      }
      if (v != it.rate) rates[it.id] = v;
    }
    final ftxt = _freightCtrl.text.trim();
    final freight = ftxt.isEmpty ? null : double.tryParse(ftxt);
    if (ftxt.isNotEmpty && (freight == null || freight < 0)) {
      _snack('Please enter a valid freight amount.', error: true);
      return;
    }
    final freightChanged = freight != o.freight;
    if (rates.isEmpty && !freightChanged) {
      _snack('There are no changes to save.');
      return;
    }
    await _run(() => _service.saveRates(o.id, rates, freight: freight, setFreight: freightChanged),
        'The rates have been saved.');
  }

  Future<void> _changeStatus() async {
    final o = _order!;
    final next = await showModalBottomSheet<String>(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const ListTile(title: Text('Change status', style: TextStyle(fontWeight: FontWeight.w600))),
          ...staffOrderStatuses.map((s) => ListTile(
                leading: Icon(Icons.circle, size: 12, color: staffOrderStatusColor(s)),
                title: Text(staffStatusLabel(s)),
                trailing: s == o.status ? const Icon(Icons.check, color: _teal) : null,
                onTap: () => Navigator.pop(ctx, s),
              )),
        ]),
      ),
    );
    if (next == null || next == o.status || !mounted) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Change status?'),
        content: Text(
            'From "${staffStatusLabel(o.status)}" to "${staffStatusLabel(next)}". The partner will see this update.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Change')),
        ],
      ),
    );
    if (ok == true) await _run(() => _service.setStatus(o.id, next), 'The status has been updated.');
  }

  String _title(String s) => s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';

  // the delivery mode, then optionally a transporter of that mode
  Future<void> _changeTransport() async {
    final o = _order!;
    final picked = await showModalBottomSheet<(String, String?)>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _TransportSheet(mode: o.transportMode, transportId: o.transportId),
    );
    if (picked == null || !mounted) return;
    if (picked.$1 == o.transportMode && picked.$2 == o.transportId) return;
    await _run(() => _service.setTransport(o.id, picked.$1, picked.$2), 'The delivery mode has been changed.');
  }

  Future<void> _sendToMarg() async {
    final o = _order!;
    final unsent = o.items.where((i) => i.margPushedAt == null).length;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Send to Marg?'),
        content: Text('$unsent line${unsent == 1 ? '' : 's'} will be sent to Marg, each with its chosen batch '
            '(or the earliest-expiry live batch where none is chosen).'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true), child: const Text('Send', style: TextStyle(color: _teal))),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      final no = await _service.sendToMarg(o.id);
      _snack(no != null ? 'The order has been sent to Marg (order $no).' : 'The order has been sent to Marg.');
      await _load();
    } catch (e) {
      _snack(RetailerService.messageOf(e, fallback: 'The order could not be sent to Marg.'), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // ---- lines ----

  Future<void> _lineMenu(StaffOrderItem it) async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(
              title: Text(it.productName, style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text('Qty ${it.quantity}')),
          if (it.margPushedAt != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 6),
              child: Text('This line is already in Marg. A change here does not reach Marg, so make it there too.',
                  style: TextStyle(fontSize: 12.5, color: Colors.orange.shade800)),
            ),
          ListTile(
              leading: const Icon(Icons.inventory_2_outlined),
              title: const Text('Choose batch'),
              onTap: () => Navigator.pop(ctx, 'batch')),
          ListTile(
              leading: const Icon(Icons.edit_outlined),
              title: const Text('Change quantity'),
              onTap: () => Navigator.pop(ctx, 'qty')),
          ListTile(
            leading: const Icon(Icons.delete_outline, color: Colors.red),
            title: const Text('Remove from order', style: TextStyle(color: Colors.red)),
            onTap: () => Navigator.pop(ctx, 'remove'),
          ),
        ]),
      ),
    );
    if (choice == 'batch') await _chooseBatch(it);
    if (choice == 'qty') await _changeQuantity(it);
    if (choice == 'remove') await _removeLine(it);
  }

  Future<void> _chooseBatch(StaffOrderItem it) async {
    setState(() => _busy = true);
    LineBatchOptions? opts;
    try {
      opts = (await _service.batchOptions(widget.orderId)).where((o) => o.itemId == it.id).firstOrNull;
    } catch (e) {
      _snack(RetailerService.messageOf(e, fallback: 'The batches could not be loaded.'), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
    if (opts == null || !mounted) return;
    if (!opts.margLinked) {
      _snack('This product is not linked to Marg, so it has no batches.', error: true);
      return;
    }
    if (opts.batches.isEmpty) {
      _snack('There is no live Marg batch with stock for this product.', error: true);
      return;
    }
    final current = opts.selectedCode ?? opts.defaultCode;
    final code = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * 0.7),
          child: ListView(shrinkWrap: true, children: [
            ListTile(
              title: const Text('Choose batch', style: TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text('${it.productName} · Qty ${it.quantity}'),
            ),
            ...opts!.batches.map((b) => ListTile(
                  title: Text(b.batch.isEmpty ? b.code : b.batch),
                  subtitle: Text([
                    if (b.expiry.isNotEmpty) 'Exp ${b.expiry}',
                    'Stock ${b.stock % 1 == 0 ? b.stock.toStringAsFixed(0) : b.stock}',
                    if (b.mrp != null) 'MRP Rs. ${_money.format(b.mrp)}',
                    if (b.code == opts!.defaultCode) 'earliest expiry',
                  ].join(' · ')),
                  trailing: b.code == current ? const Icon(Icons.check, color: _teal) : null,
                  onTap: () => Navigator.pop(ctx, b.code),
                )),
          ]),
        ),
      ),
    );
    if (code == null || code == opts.selectedCode) return;
    await _run(() => _service.setBatch(widget.orderId, it.id, code), 'The batch has been updated.');
  }

  Future<int?> _askQuantity(String title, int initial) async {
    final ctrl = TextEditingController(text: '$initial');
    final v = await showDialog<int>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(labelText: 'Quantity'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, int.tryParse(ctrl.text.trim())), child: const Text('Save')),
        ],
      ),
    );
    if (v != null && v < 1) {
      _snack('The quantity must be at least 1.', error: true);
      return null;
    }
    return v;
  }

  Future<void> _changeQuantity(StaffOrderItem it) async {
    final q = await _askQuantity(it.productName, it.quantity);
    if (q == null || q == it.quantity) return;
    await _run(() => _service.setQuantity(widget.orderId, it.id, q), 'The quantity has been updated.');
  }

  Future<void> _removeLine(StaffOrderItem it) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove this product?'),
        content: Text('${it.productName} will be removed from the order. The partner will see this change.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Remove', style: TextStyle(color: Colors.red))),
        ],
      ),
    );
    if (ok == true) await _run(() => _service.deleteItem(widget.orderId, it.id), 'The product has been removed.');
  }

  Future<void> _addProduct() async {
    final picked = await showModalBottomSheet<Product>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => const _ProductPicker(),
    );
    if (picked == null || !mounted) return;
    final q = await _askQuantity(picked.name, picked.moq > 0 ? picked.moq : 1);
    if (q == null) return;
    await _run(() => _service.addItem(widget.orderId, productId: picked.id, productName: picked.name, quantity: q),
        '${picked.name} has been added.');
  }

  // ---- photos ----

  Future<void> _addPhoto(String type) async {
    // a bill can also be the PDF itself (or any saved file); 'file' below
    final source = await showModalBottomSheet<Object>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Take a photo'),
              onTap: () => Navigator.pop(ctx, ImageSource.camera)),
          ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose from gallery'),
              onTap: () => Navigator.pop(ctx, ImageSource.gallery)),
          if (type == 'bill')
            ListTile(
                leading: const Icon(Icons.picture_as_pdf_outlined),
                title: const Text('Choose a PDF or file'),
                onTap: () => Navigator.pop(ctx, 'file')),
        ]),
      ),
    );
    if (source == null) return;
    Uint8List bytes;
    String name;
    if (source == 'file') {
      final res = await FilePicker.pickFiles(
          type: FileType.custom, allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'], withData: true);
      final f = res?.files.firstOrNull;
      if (f == null || f.bytes == null) return;
      bytes = f.bytes!;
      name = f.name;
    } else {
      final file = await ImagePicker().pickImage(source: source as ImageSource, imageQuality: 80, maxWidth: 2000);
      if (file == null) return;
      bytes = await file.readAsBytes();
      name = file.name;
    }
    await _run(() => _service.addPhoto(widget.orderId, bytes, name, type: type),
        type == 'tracking' ? 'The tracking photo has been attached.' : 'The bill has been attached.');
  }

  Future<void> _deletePhoto(StaffOrderPhoto p) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete this photo?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Delete', style: TextStyle(color: Colors.red))),
        ],
      ),
    );
    if (ok == true) await _run(() => _service.deletePhoto(p.id), 'The photo has been deleted.');
  }

  // ---- WhatsApp and PDF ----

  Future<void> _whatsApp() async {
    setState(() => _busy = true);
    try {
      final m = await _service.whatsAppMessage(widget.orderId);
      final digits = m.phone.replaceAll(RegExp(r'[^\d]'), '');
      final uri = Uri.parse('https://wa.me/$digits?text=${Uri.encodeComponent(m.message)}');
      if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
        _snack('WhatsApp could not be opened on this phone.', error: true);
        return;
      }
      await _service.markWhatsAppSent(widget.orderId, m.phone);
    } catch (e) {
      _snack(RetailerService.messageOf(e, fallback: 'The WhatsApp message could not be prepared.'), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openPdf() async {
    setState(() => _busy = true);
    try {
      final file = await _service.pdf(widget.orderId);
      final res = await OpenFilex.open(file.path, type: 'application/pdf');
      if (res.type != ResultType.done)
        _snack(res.message.isNotEmpty ? res.message : 'The PDF could not be opened.', error: true);
    } catch (e) {
      _snack(RetailerService.messageOf(e, fallback: 'The PDF could not be made. An order needs to be confirmed first.'),
          error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _card(Widget child) => Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.grey.shade200)),
        child: child,
      );

  @override
  Widget build(BuildContext context) {
    final o = _order;
    final canEdit = _canEdit;
    final fmt = DateFormat('d MMM yyyy, h:mm a');
    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: Colors.black,
        title: Text(o?.ref ?? 'Order', style: const TextStyle(fontWeight: FontWeight.w600)),
      ),
      body: o == null
          ? Center(
              child: _error != null
                  ? Padding(padding: const EdgeInsets.all(24), child: Text(_error!, textAlign: TextAlign.center))
                  : const CircularProgressIndicator(color: _teal))
          : RefreshIndicator(
              onRefresh: _load,
              color: _teal,
              child: ListView(padding: const EdgeInsets.all(16), children: [
                // party and status
                _card(Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(
                      child: Text(o.partyName.isEmpty ? o.partyPhone : o.partyName,
                          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
                    ),
                    InkWell(
                      onTap: canEdit && !_busy ? _changeStatus : null,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                            color: staffOrderStatusColor(o.status).withAlpha(25),
                            borderRadius: BorderRadius.circular(12)),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          Text(staffStatusLabel(o.status),
                              style: TextStyle(
                                  color: staffOrderStatusColor(o.status), fontWeight: FontWeight.w600, fontSize: 12.5)),
                          if (canEdit) Icon(Icons.arrow_drop_down, size: 18, color: staffOrderStatusColor(o.status)),
                        ]),
                      ),
                    ),
                  ]),
                  const SizedBox(height: 4),
                  if (o.partyName.isNotEmpty)
                    Text(o.partyPhone, style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
                  Text('Placed ${fmt.format(o.createdAt.toLocal())}',
                      style: TextStyle(fontSize: 12.5, color: Colors.grey.shade600)),
                  // staff who can edit change it here; the partner sees the change
                  InkWell(
                    onTap: canEdit && !_busy ? _changeTransport : null,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 2),
                      child: Row(children: [
                        Flexible(
                          child: Text(
                            o.transportMode.isEmpty
                                ? 'Delivery: not set'
                                : 'Delivery: By ${_title(o.transportMode)}'
                                    '${o.transportName != null ? ' · ${o.transportName}' : ''}',
                            style: TextStyle(fontSize: 12.5, color: Colors.grey.shade700),
                          ),
                        ),
                        if (canEdit) ...[
                          const SizedBox(width: 6),
                          const Text('Change',
                              style: TextStyle(fontSize: 12.5, color: _teal, fontWeight: FontWeight.w600)),
                        ],
                      ]),
                    ),
                  ),
                  if (o.notes != null && o.notes!.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text('Note: ${o.notes}', style: const TextStyle(fontSize: 13)),
                  ],
                  const SizedBox(height: 10),
                  Row(children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _busy ? null : _whatsApp,
                        icon: const Icon(Icons.chat_outlined, size: 18, color: Color(0xFF25D366)),
                        label: const Text('WhatsApp'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _busy || o.status == 'pending' ? null : _openPdf,
                        icon: const Icon(Icons.picture_as_pdf_outlined, size: 18, color: Colors.red),
                        label: const Text('PDF'),
                      ),
                    ),
                  ]),
                ])),
                // lines with rates
                _card(Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Products', style: TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 6),
                  ...o.items.map((it) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 7),
                        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Expanded(
                            child: InkWell(
                              // lines already in Marg stay editable here, as on the website
                              onTap: canEdit && !_busy ? () => _lineMenu(it) : null,
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text(it.productName,
                                    style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500)),
                                Text(
                                  [
                                    'Qty ${it.quantity}',
                                    'Batch ${it.batchCode ?? 'default'}',
                                    if (it.margPushedAt != null) 'in Marg',
                                  ].join(' · '),
                                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                                ),
                                if (it.lineTotal != null)
                                  Text('Amount Rs. ${_money.format(it.lineTotal)}',
                                      style: TextStyle(fontSize: 12, color: Colors.grey.shade800)),
                                if (canEdit)
                                  const Text('Tap for batch, quantity or remove',
                                      style: TextStyle(fontSize: 11, color: _teal)),
                              ]),
                            ),
                          ),
                          // sales to this party and how its batches were bought, like the website's panel
                          IconButton(
                            icon: const Icon(Icons.history, color: _teal, size: 22),
                            tooltip: 'Sales & purchase history',
                            visualDensity: VisualDensity.compact,
                            onPressed: () => showProductHistory(context,
                                partnerId: o.partnerId,
                                productId: it.productId,
                                productName: it.productName,
                                orderId: o.id,
                                lineBatchCode: it.batchCode),
                          ),
                          const SizedBox(width: 4),
                          SizedBox(
                            width: 96,
                            child: canEdit
                                ? TextField(
                                    controller: _rates[it.id],
                                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                    decoration: const InputDecoration(
                                        isDense: true,
                                        prefixText: 'Rs. ',
                                        hintText: 'Rate',
                                        border: OutlineInputBorder()),
                                  )
                                : Text(it.rate != null ? 'Rs. ${_money.format(it.rate)}' : 'No rate',
                                    textAlign: TextAlign.right, style: const TextStyle(fontSize: 13)),
                          ),
                        ]),
                      )),
                  if (canEdit)
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton.icon(
                        onPressed: _busy ? null : _addProduct,
                        icon: const Icon(Icons.add, size: 18),
                        label: const Text('Add product'),
                      ),
                    ),
                  const Divider(),
                  Row(children: [
                    const Expanded(child: Text('Freight', style: TextStyle(fontSize: 13))),
                    SizedBox(
                      width: 96,
                      child: canEdit
                          ? TextField(
                              controller: _freightCtrl,
                              keyboardType: const TextInputType.numberWithOptions(decimal: true),
                              decoration: const InputDecoration(
                                  isDense: true, prefixText: 'Rs. ', border: OutlineInputBorder()),
                            )
                          : Text(o.freight != null ? 'Rs. ${_money.format(o.freight)}' : '-',
                              textAlign: TextAlign.right),
                    ),
                  ]),
                  const SizedBox(height: 8),
                  if (o.itemsTotal != null)
                    Row(children: [
                      const Text('Items', style: TextStyle(fontSize: 13)),
                      const Spacer(),
                      Text('Rs. ${_money.format(o.itemsTotal)}', style: const TextStyle(fontSize: 13)),
                    ]),
                  if (o.orderTotal != null)
                    Row(children: [
                      const Text('Total', style: TextStyle(fontWeight: FontWeight.w700)),
                      const Spacer(),
                      Text('Rs. ${_money.format(o.orderTotal)}', style: const TextStyle(fontWeight: FontWeight.w700)),
                    ]),
                  if (canEdit) ...[
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: _busy ? null : _saveRates,
                        icon: const Icon(Icons.save_outlined, size: 18),
                        label: const Text('Save rates'),
                      ),
                    ),
                  ],
                ])),
                // photos
                _card(Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Bills & tracking', style: TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  if (o.photos.isEmpty)
                    Text('No bills or tracking photos yet.', style: TextStyle(fontSize: 13, color: Colors.grey.shade600))
                  else
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: o.photos.map((p) {
                        final images = o.photos.where((x) => !x.isPdf).toList();
                        return GestureDetector(
                          // a PDF opens in the phone's PDF viewer; photos in the gallery
                          onTap: () => p.isPdf
                              ? launchUrl(Uri.parse(p.url), mode: LaunchMode.externalApplication)
                              : context.push('/gallery', extra: {
                                  'imageUrls': images.map((x) => x.url).toList(),
                                  'initialIndex': images.indexOf(p),
                                }),
                          onLongPress: canEdit ? () => _deletePhoto(p) : null,
                          child: Stack(children: [
                            ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: p.isPdf
                                  ? Container(
                                      width: 84,
                                      height: 84,
                                      color: Colors.red.shade50,
                                      child: Icon(Icons.picture_as_pdf, color: Colors.red.shade700, size: 34),
                                    )
                                  : CachedNetworkImage(imageUrl: p.url, width: 84, height: 84, fit: BoxFit.cover),
                            ),
                            Positioned(
                              left: 4,
                              bottom: 4,
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                                decoration:
                                    BoxDecoration(color: Colors.black54, borderRadius: BorderRadius.circular(6)),
                                child: Text(p.type == 'tracking' ? 'Tracking' : (p.isPdf ? 'Bill PDF' : 'Bill'),
                                    style: const TextStyle(color: Colors.white, fontSize: 9.5)),
                              ),
                            ),
                          ]),
                        );
                      }).toList(),
                    ),
                  if (canEdit) ...[
                    const SizedBox(height: 10),
                    Row(children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _busy ? null : () => _addPhoto('bill'),
                          icon: const Icon(Icons.receipt_outlined, size: 18),
                          label: const Text('Bill'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _busy ? null : () => _addPhoto('tracking'),
                          icon: const Icon(Icons.local_shipping_outlined, size: 18),
                          label: const Text('Tracking photo'),
                        ),
                      ),
                    ]),
                    const SizedBox(height: 4),
                    Text('A bill can be a photo or a PDF. Hold one to delete it.',
                        style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
                  ],
                ])),
                // Marg
                _card(Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Marg', style: TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 6),
                  if (o.margOrderNo != null)
                    Text(
                        'Sent to Marg: order ${o.margOrderNo}${o.margPushedAt != null ? ' on ${fmt.format(o.margPushedAt!.toLocal())}' : ''}',
                        style: const TextStyle(fontSize: 13))
                  else
                    Text('Not sent to Marg yet.', style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
                  if (canEdit && !o.fullySentToMarg) ...[
                    const SizedBox(height: 10),
                    if (o.status != 'confirmed')
                      Text('Confirm the order to send it to Marg.',
                          style: TextStyle(fontSize: 12.5, color: Colors.grey.shade600))
                    else
                      SizedBox(
                        width: double.infinity,
                        height: 46,
                        child: ElevatedButton.icon(
                          onPressed: _busy ? null : _sendToMarg,
                          icon: const Icon(Icons.send_outlined, size: 18),
                          label: Text(o.margOrderNo != null ? 'Send remaining lines to Marg' : 'Send to Marg'),
                          style: ElevatedButton.styleFrom(
                              backgroundColor: _teal, foregroundColor: Colors.white, elevation: 0),
                        ),
                      ),
                  ],
                ])),
              ]),
            ),
    );
  }
}

/// Search the catalogue to add a product to an order.
class _ProductPicker extends StatefulWidget {
  const _ProductPicker();

  @override
  State<_ProductPicker> createState() => _ProductPickerState();
}

class _ProductPickerState extends State<_ProductPicker> {
  final _ctrl = TextEditingController();
  Timer? _debounce;
  List<Product> _results = [];
  bool _loading = false;

  @override
  void dispose() {
    _debounce?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _search(String q) async {
    if (q.trim().length < 2) {
      setState(() => _results = []);
      return;
    }
    setState(() => _loading = true);
    try {
      final res = await ProductService().getProducts(search: q.trim(), limit: 25);
      if (mounted) setState(() => _results = res.products);
    } catch (_) {
      if (mounted) setState(() => _results = []);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.75,
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: TextField(
              controller: _ctrl,
              autofocus: true,
              onChanged: (v) {
                _debounce?.cancel();
                _debounce = Timer(const Duration(milliseconds: 350), () => _search(v));
              },
              decoration: const InputDecoration(
                hintText: 'Search products to add',
                prefixIcon: Icon(Icons.search),
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
          ),
          if (_loading) const LinearProgressIndicator(color: Color(0xFF00A6A4)),
          Expanded(
            child: ListView(
              children: _results
                  .map((p) => ListTile(
                        title: Text(p.name, style: const TextStyle(fontSize: 14)),
                        subtitle:
                            Text([if (p.mrp != null) 'MRP Rs. ${p.mrp}', if (p.moq > 1) 'MOQ ${p.moq}'].join(' · ')),
                        onTap: () => Navigator.pop(context, p),
                      ))
                  .toList(),
            ),
          ),
        ]),
      ),
    );
  }
}


/// Picks a delivery mode and, optionally, one of its transporters; pops
/// (mode, transporter id or null).
class _TransportSheet extends StatefulWidget {
  final String mode;
  final String? transportId;
  const _TransportSheet({required this.mode, this.transportId});

  @override
  State<_TransportSheet> createState() => _TransportSheetState();
}

class _TransportSheetState extends State<_TransportSheet> {
  static const _teal = Color(0xFF00A6A4);
  final _service = TransportService();
  List<TransportMode>? _modes;
  List<Transport>? _transports;
  late String _mode = widget.mode;
  late String? _transportId = widget.transportId;
  String? _error;

  @override
  void initState() {
    super.initState();
    _service.getModes().then((m) {
      if (mounted) setState(() => _modes = m);
    }).catchError((_) {
      if (mounted) setState(() => _error = 'The delivery modes could not be loaded.');
    });
    if (_mode.isNotEmpty) _loadTransports();
  }

  void _loadTransports() {
    setState(() => _transports = null);
    final mode = _mode;
    _service.getTransports(mode: mode).then((t) {
      if (mounted && mode == _mode) setState(() => _transports = t);
    }).catchError((_) {
      if (mounted && mode == _mode) setState(() => _transports = []);
    });
  }

  String _title(String s) => s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';

  Widget _transporter(String? id, String title, {String? subtitle}) => RadioListTile<String?>(
        contentPadding: EdgeInsets.zero,
        value: id,
        groupValue: _transportId,
        activeColor: _teal,
        title: Text(title),
        subtitle: subtitle != null ? Text(subtitle) : null,
        onChanged: (v) => setState(() => _transportId = v),
      );

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.8),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 12),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Change delivery mode', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text('The partner will see this on the order.',
                style: TextStyle(fontSize: 12.5, color: Colors.grey.shade600)),
            const SizedBox(height: 14),
            if (_error != null)
              Text(_error!, style: TextStyle(color: Colors.red.shade700))
            else if (_modes == null)
              const Center(child: CircularProgressIndicator(color: _teal))
            else ...[
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: _modes!
                    .map((m) => ChoiceChip(
                          label: Text(_title(m.name)),
                          selected: _mode == m.name,
                          selectedColor: _teal.withAlpha(40),
                          onSelected: (_) {
                            if (_mode == m.name) return;
                            setState(() {
                              _mode = m.name;
                              _transportId = null;
                            });
                            _loadTransports();
                          },
                        ))
                    .toList(),
              ),
              if (_mode.isNotEmpty) ...[
                const SizedBox(height: 14),
                Text('Transporter', style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
                Flexible(
                  child: _transports == null
                      ? const Padding(
                          padding: EdgeInsets.all(12), child: Center(child: CircularProgressIndicator(color: _teal)))
                      : ListView(shrinkWrap: true, children: [
                          _transporter(null, 'No particular transporter'),
                          ..._transports!.map(
                              (t) => _transporter(t.id, t.name, subtitle: t.gstNumber != null ? 'GST ${t.gstNumber}' : null)),
                        ]),
                ),
              ],
            ],
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              height: 46,
              child: ElevatedButton(
                onPressed: _mode.isEmpty ? null : () => Navigator.pop(context, (_mode, _transportId)),
                style: ElevatedButton.styleFrom(backgroundColor: _teal, foregroundColor: Colors.white, elevation: 0),
                child: const Text('Save'),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}
