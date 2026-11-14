import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import '../../providers/auth_provider.dart';
import '../../services/packing_service.dart';
import '../../services/retailer_service.dart';
import '../../widgets/fullscreen_image_gallery.dart';

const _teal = Color(0xFF00A6A4);
const _ink = Color(0xFF1A1A1A);

/// Packing one order: for each product, a photo of its batch (read by AI
/// on the server and checked against the order), then a tick; with every
/// product ticked, "Mark order Packed". Admins can allow a batch that does
/// not match and reopen a packed order.
class PackingOrderScreen extends ConsumerStatefulWidget {
  final String orderId;
  const PackingOrderScreen({super.key, required this.orderId});

  @override
  ConsumerState<PackingOrderScreen> createState() => _PackingOrderScreenState();
}

class _PackingOrderScreenState extends ConsumerState<PackingOrderScreen> {
  final _service = PackingService();
  PackingOrder? _order;
  String? _error;
  String? _busyItem; // the line being photographed or ticked
  bool _busy = false;
  bool _showLog = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final o = await _service.get(widget.orderId);
      if (mounted) setState(() { _order = o; _error = null; });
    } catch (e) {
      if (mounted) setState(() => _error = RetailerService.messageOf(e, fallback: 'The order could not be loaded.'));
    }
  }

  void _snack(String msg, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: error ? Colors.red.shade700 : Colors.green.shade700,
    ));
  }

  // ---- steps ----

  Future<void> _photo(PackingItem it) async {
    final file = await ImagePicker().pickImage(source: ImageSource.camera, imageQuality: 85, maxWidth: 1800);
    if (file == null) return;
    final bytes = await file.readAsBytes();
    setState(() => _busyItem = it.id);
    try {
      final check = await _service.sendPhoto(widget.orderId, it.id, bytes, file.name);
      await _load();
      if (!mounted) return;
      await _showCheck(it, check);
    } catch (e) {
      _snack(RetailerService.messageOf(e, fallback: 'The photo could not be sent. Please try again.'), error: true);
    } finally {
      if (mounted) setState(() => _busyItem = null);
    }
  }

  Future<void> _type(PackingItem it) async {
    final ctrl = TextEditingController();
    final batch = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Type the batch number'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(it.productName, style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
            const SizedBox(height: 8),
            TextField(
              controller: ctrl,
              autofocus: true,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(labelText: 'Batch number as printed', border: OutlineInputBorder()),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, ctrl.text.trim()), child: const Text('Check')),
        ],
      ),
    );
    if (batch == null || batch.isEmpty) return;
    setState(() => _busyItem = it.id);
    try {
      final check = await _service.typeBatch(widget.orderId, it.id, batch);
      await _load();
      if (!mounted) return;
      await _showCheck(it, check);
    } catch (e) {
      _snack(RetailerService.messageOf(e), error: true);
    } finally {
      if (mounted) setState(() => _busyItem = null);
    }
  }

  /// What the check came to; on a match, offers to tick the product.
  Future<void> _showCheck(PackingItem it, PackingCheck c) async {
    final ok = c.ok;
    final tick = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: Icon(ok ? Icons.check_circle : (c.result == 'unreadable' ? Icons.help_outline : Icons.error_outline),
            color: ok ? Colors.green.shade600 : (c.result == 'unreadable' ? Colors.orange.shade700 : Colors.red.shade600), size: 40),
        title: Text(ok
            ? (c.result == 'unchecked' ? 'Batch recorded' : 'Batch matches')
            : (c.result == 'unreadable' ? "Couldn't read the batch" : "Batch doesn't match")),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(it.productName, style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            if (c.readBatch.isNotEmpty) _kv('On the pack', c.readBatch + (c.readExpiry.isNotEmpty ? '  ·  exp ${c.readExpiry}' : '')),
            if (c.expectedBatch.isNotEmpty) _kv('On the order', c.expectedBatch),
            if (c.note.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(c.note, style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
            ],
          ],
        ),
        actions: ok
            ? [
                TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Not yet')),
                FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: _teal),
                  onPressed: () => Navigator.pop(ctx, true),
                  child: Text('Packed ${it.quantity} — tick it'),
                ),
              ]
            : [
                TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('OK')),
              ],
      ),
    );
    if (tick == true) await _setPacked(it, true);
  }

  Widget _kv(String k, String v) => Padding(
        padding: const EdgeInsets.only(bottom: 2),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 92, child: Text(k, style: TextStyle(fontSize: 13, color: Colors.grey.shade600))),
          Expanded(child: Text(v, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600))),
        ]),
      );

  Future<void> _setPacked(PackingItem it, bool packed) async {
    setState(() => _busyItem = it.id);
    try {
      await _service.setPacked(widget.orderId, it.id, packed);
      await _load();
    } catch (e) {
      _snack(RetailerService.messageOf(e), error: true);
    } finally {
      if (mounted) setState(() => _busyItem = null);
    }
  }

  Future<String?> _askReason(String title, {bool required = true}) async {
    final ctrl = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          decoration: InputDecoration(labelText: required ? 'Reason' : 'Reason (optional)', border: const OutlineInputBorder()),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              if (required && ctrl.text.trim().isEmpty) return;
              Navigator.pop(ctx, ctrl.text.trim());
            },
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  Future<void> _allow(PackingItem it) async {
    final reason = await _askReason('Allow batch ${it.readBatch.isEmpty ? '(none)' : it.readBatch}?');
    if (reason == null) return;
    await _run(() => _service.allow(widget.orderId, it.id, reason), 'Allowed. It can be ticked now.');
  }

  Future<void> _finish() async {
    await _run(() => _service.finish(widget.orderId), 'The order is marked Packed.');
  }

  Future<void> _reopen() async {
    final reason = await _askReason('Reopen for packing?', required: false);
    if (reason == null) return;
    await _run(() => _service.reopen(widget.orderId, reason), 'Reopened. The order is Confirmed again.');
  }

  Future<void> _run(Future<void> Function() fn, String done) async {
    setState(() => _busy = true);
    try {
      await fn();
      await _load();
      _snack(done);
    } catch (e) {
      _snack(RetailerService.messageOf(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _openPhoto(String url) => Navigator.of(context)
      .push(MaterialPageRoute(builder: (_) => FullScreenImageGalleryScreen(imageUrls: [url])));

  // ---- view ----

  @override
  Widget build(BuildContext context) {
    final isAdmin = ref.watch(authProvider).user?.role == 'admin';
    final o = _order;
    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: Text(o?.customer.isNotEmpty == true ? o!.customer : 'Packing',
            style: const TextStyle(color: _ink, fontWeight: FontWeight.w600)),
      ),
      body: o == null
          ? Center(
              child: _error != null
                  ? Padding(padding: const EdgeInsets.all(24), child: Text(_error!, textAlign: TextAlign.center))
                  : const CircularProgressIndicator(color: _teal))
          : RefreshIndicator(
              color: _teal,
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
                children: [
                  _header(o),
                  const SizedBox(height: 14),
                  for (final it in o.items) _itemCard(o, it, isAdmin),
                  const SizedBox(height: 8),
                  if (o.log.isNotEmpty) _logSection(o),
                ],
              ),
            ),
      bottomNavigationBar: o == null ? null : _bottomBar(o, isAdmin),
    );
  }

  Widget _header(PackingOrder o) {
    final fmt = DateFormat('d MMM yyyy, h:mm a');
    final done = o.items.isEmpty ? 0.0 : o.ticked / o.items.length;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(
              child: Text(
                [if (o.city.isNotEmpty) o.city, if (o.createdAt != null) 'Ordered ${fmt.format(o.createdAt!)}'].join(' · '),
                style: TextStyle(fontSize: 12.5, color: Colors.grey.shade600),
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: (o.status == 'packed' ? Colors.teal : Colors.blue).withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(o.status == 'packed' ? 'Packed' : (o.status == 'confirmed' ? 'Confirmed' : o.status),
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: o.status == 'packed' ? Colors.teal.shade700 : Colors.blue.shade700)),
            ),
          ]),
          if (o.transportMode.isNotEmpty || o.transportName.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text('Delivery: ${[o.transportMode, o.transportName].where((s) => s.isNotEmpty).join(' · ')}',
                style: TextStyle(fontSize: 12.5, color: Colors.grey.shade700)),
          ],
          if (o.notes.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text('Note: ${o.notes}', style: TextStyle(fontSize: 12.5, color: Colors.grey.shade700)),
          ],
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(value: done, minHeight: 6, color: _teal, backgroundColor: Colors.grey.shade200),
              ),
            ),
            const SizedBox(width: 10),
            Text('${o.ticked} of ${o.items.length} packed', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
          ]),
          if (o.status == 'packed' && o.packedAt != null) ...[
            const SizedBox(height: 6),
            Text('Packed by ${o.packedBy.isEmpty ? '—' : o.packedBy} on ${fmt.format(o.packedAt!)}',
                style: TextStyle(fontSize: 12.5, color: Colors.teal.shade700)),
          ],
        ],
      ),
    );
  }

  Widget _itemCard(PackingOrder o, PackingItem it, bool isAdmin) {
    final editable = o.status == 'confirmed';
    final busy = _busyItem == it.id;
    final (Color c, String label) = switch (it.result) {
      'match' => (Colors.green.shade700, 'Batch matches'),
      'unchecked' => (Colors.grey.shade700, 'Batch recorded'),
      'mismatch' => (Colors.red.shade700, "Batch doesn't match"),
      'unreadable' => (Colors.orange.shade800, "Couldn't read"),
      _ => (Colors.grey.shade500, 'Photo needed'),
    };
    final needsHelp = it.result == 'mismatch' || it.result == 'unreadable';
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: it.packed ? const Color(0xFFF0FBF9) : Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: it.packed ? _teal.withValues(alpha: 0.5) : Colors.grey.shade200),
      ),
      padding: const EdgeInsets.fromLTRB(6, 8, 12, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 44,
                child: busy
                    ? const Padding(
                        padding: EdgeInsets.all(12),
                        child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: _teal)))
                    : Checkbox(
                        value: it.packed,
                        activeColor: _teal,
                        onChanged: !editable || _busyItem != null || (!it.packed && !it.canTick)
                            ? null
                            : (v) => _setPacked(it, v == true),
                      ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(it.productName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14.5, color: _ink)),
                      const SizedBox(height: 2),
                      Text(
                        it.expectedBatch.isNotEmpty
                            ? 'Batch ${it.expectedBatch}${it.expectedExpiry.isNotEmpty ? '  ·  exp ${it.expectedExpiry}' : ''}'
                            : (it.knownBatches > 0 ? 'Any of its Marg batches' : 'No batch in Marg'),
                        style: TextStyle(fontSize: 12.5, color: Colors.grey.shade700),
                      ),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text('× ${it.quantity}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: _ink)),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(left: 44),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 6),
                Row(children: [
                  if (it.photoUrl.isNotEmpty) ...[
                    GestureDetector(
                      onTap: () => _openPhoto(it.photoUrl),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: CachedNetworkImage(imageUrl: it.photoUrl, width: 52, height: 52, fit: BoxFit.cover),
                      ),
                    ),
                    const SizedBox(width: 10),
                  ],
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(it.overridden ? '$label · allowed' : label,
                            style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: it.overridden ? Colors.orange.shade800 : c)),
                        if (it.readBatch.isNotEmpty)
                          Text('${it.readSource == 'typed' ? 'Typed' : 'On the pack'}: ${it.readBatch}${it.readExpiry.isNotEmpty ? ' · exp ${it.readExpiry}' : ''}',
                              style: TextStyle(fontSize: 12, color: Colors.grey.shade700)),
                        if (it.resultNote.isNotEmpty && !it.packed)
                          Text(it.resultNote, style: TextStyle(fontSize: 11.5, color: Colors.grey.shade600)),
                        if (it.overridden && it.overrideReason.isNotEmpty)
                          Text('Allowed by ${it.overrideBy}: ${it.overrideReason}',
                              style: TextStyle(fontSize: 11.5, color: Colors.orange.shade800)),
                        if (it.packed)
                          Text('Ticked by ${it.packedBy}${it.packedAt != null ? ' · ${DateFormat('d MMM, h:mm a').format(it.packedAt!)}' : ''}',
                              style: TextStyle(fontSize: 11.5, color: Colors.teal.shade700)),
                        if (it.qtyChanged)
                          Text('The quantity changed after it was ticked; tick it again.',
                              style: TextStyle(fontSize: 11.5, color: Colors.orange.shade800)),
                      ],
                    ),
                  ),
                ]),
                if (editable && !it.packed) ...[
                  const SizedBox(height: 8),
                  Wrap(spacing: 8, runSpacing: 6, children: [
                    OutlinedButton.icon(
                      onPressed: _busyItem != null ? null : () => _photo(it),
                      icon: const Icon(Icons.photo_camera_outlined, size: 18),
                      label: Text(it.photoUrl.isEmpty ? 'Photo of batch' : 'Retake'),
                      style: OutlinedButton.styleFrom(foregroundColor: _teal, side: const BorderSide(color: _teal)),
                    ),
                    if (needsHelp)
                      TextButton(
                        onPressed: _busyItem != null ? null : () => _type(it),
                        child: const Text('Type batch'),
                      ),
                    if (needsHelp && isAdmin && !it.overridden)
                      TextButton(
                        onPressed: _busy ? null : () => _allow(it),
                        style: TextButton.styleFrom(foregroundColor: Colors.orange.shade800),
                        child: const Text('Allow anyway'),
                      ),
                  ]),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _logSection(PackingOrder o) {
    const names = {
      'started': 'Started',
      'photo': 'Photo',
      'typed': 'Typed batch',
      'packed': 'Ticked',
      'unpacked': 'Unticked',
      'override': 'Allowed by admin',
      'finished': 'Marked Packed',
      'reopened': 'Reopened',
    };
    final fmt = DateFormat('d MMM, h:mm a');
    return Container(
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200)),
      child: Column(children: [
        ListTile(
          dense: true,
          title: Text('Packing log (${o.log.length})', style: const TextStyle(fontWeight: FontWeight.w600)),
          trailing: Icon(_showLog ? Icons.expand_less : Icons.expand_more),
          onTap: () => setState(() => _showLog = !_showLog),
        ),
        if (_showLog)
          for (final l in o.log)
            ListTile(
              dense: true,
              title: Text('${l.user.isEmpty ? 'Someone' : l.user} · ${names[l.action] ?? l.action}${l.product.isNotEmpty ? ' · ${l.product}' : ''}',
                  style: const TextStyle(fontSize: 13)),
              subtitle: Text(
                [if (l.at != null) fmt.format(l.at!), if (l.detail.isNotEmpty && l.action != 'started') l.detail].join('\n'),
                style: const TextStyle(fontSize: 11.5),
              ),
              trailing: l.photoUrl.isEmpty
                  ? null
                  : IconButton(icon: const Icon(Icons.image_outlined), onPressed: () => _openPhoto(l.photoUrl)),
            ),
      ]),
    );
  }

  Widget? _bottomBar(PackingOrder o, bool isAdmin) {
    Widget? button;
    if (o.status == 'confirmed') {
      button = FilledButton.icon(
        onPressed: o.canFinish && !_busy ? _finish : null,
        icon: const Icon(Icons.inventory_2),
        label: Text(o.canFinish ? 'Mark order Packed' : 'Tick every product to finish (${o.ticked}/${o.items.length})'),
        style: FilledButton.styleFrom(backgroundColor: _teal, minimumSize: const Size.fromHeight(48)),
      );
    } else if (o.status == 'packed' && isAdmin) {
      button = OutlinedButton.icon(
        onPressed: _busy ? null : _reopen,
        icon: const Icon(Icons.undo),
        label: const Text('Reopen for packing'),
        style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
      );
    }
    if (button == null) return null;
    return SafeArea(
      child: Container(
        color: Colors.white,
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
        child: button,
      ),
    );
  }
}
