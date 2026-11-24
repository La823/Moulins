import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../services/packing_service.dart';
import '../services/staff_service.dart';
import 'inventory_code_tag.dart';

const _teal = Color(0xFF00A6A4);

/// An order's packing on the staff order screen, as on the website's order
/// page: who it's assigned to (staff who edit orders can hand it to another
/// packer), each product's latest batch photo with what was read and the
/// result, and the log with every photo taken (retakes too). Hidden for
/// orders not sent to packing that have no packing yet.
class OrderPackingPanel extends StatefulWidget {
  final String orderId;
  final String status;
  final bool canEdit;
  const OrderPackingPanel({super.key, required this.orderId, required this.status, required this.canEdit});

  @override
  State<OrderPackingPanel> createState() => _OrderPackingPanelState();
}

class _OrderPackingPanelState extends State<OrderPackingPanel> {
  final _packing = PackingService();
  final _staff = StaffService();
  PackingOrder? _o;
  bool _failed = false;
  bool _showLog = false;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(OrderPackingPanel old) {
    super.didUpdateWidget(old);
    if (old.status != widget.status) _load();
  }

  Future<void> _load() async {
    try {
      final o = await _packing.forOrder(widget.orderId);
      if (mounted) setState(() => (_o = o, _failed = false));
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  void _openPhoto(String url, String title) => Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => Scaffold(
          backgroundColor: Colors.black,
          appBar: AppBar(backgroundColor: Colors.black, foregroundColor: Colors.white, title: Text(title, style: const TextStyle(fontSize: 15))),
          body: InteractiveViewer(maxScale: 5, child: Center(child: CachedNetworkImage(imageUrl: url))),
        ),
      ));

  Future<void> _reassign() async {
    List<Packer> packers;
    try {
      packers = await _staff.packers();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(staffError(e))));
      return;
    }
    if (!mounted) return;
    final pick = await showModalBottomSheet<String>(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: ListView(shrinkWrap: true, children: [
          const ListTile(title: Text('Assign packing to', style: TextStyle(fontWeight: FontWeight.w600))),
          ListTile(
            leading: const Icon(Icons.groups_outlined),
            title: const Text('Nobody (whole team)'),
            trailing: _o?.assignedToId.isEmpty ?? true ? const Icon(Icons.check, color: _teal) : null,
            onTap: () => Navigator.pop(ctx, ''),
          ),
          for (final p in packers)
            ListTile(
              leading: Icon(Icons.person_outline, color: p.inTurn ? _teal : Colors.grey),
              title: Text(p.name),
              subtitle: Text([if (p.note.isNotEmpty) p.note, '${p.open} to pack'].join(' · ')),
              trailing: p.id == _o?.assignedToId ? const Icon(Icons.check, color: _teal) : null,
              onTap: () => Navigator.pop(ctx, p.id),
            ),
        ]),
      ),
    );
    if (pick == null || pick == _o?.assignedToId) return;
    setState(() => _busy = true);
    try {
      await _staff.assignPacker(widget.orderId, pick);
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(staffError(e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  static const _result = {
    'match': ('Matched', Color(0xFF15803D)),
    'unchecked': ('Recorded', Color(0xFF4B5563)),
    'mismatch': ("Doesn't match", Color(0xFFB91C1C)),
    'unreadable': ("Couldn't read", Color(0xFFB45309)),
  };
  static const _action = {
    'started': 'Started',
    'photo': 'Photo',
    'typed': 'Typed batch',
    'packed': 'Ticked',
    'unpacked': 'Unticked',
    'override': 'Allowed by admin',
    'finished': 'Marked Packed',
    'reopened': 'Reopened',
  };

  @override
  Widget build(BuildContext context) {
    final o = _o;
    if (_failed || o == null) return const SizedBox.shrink();
    final started = o.log.isNotEmpty;
    if (!started && o.status != 'packing' && o.status != 'packed') return const SizedBox.shrink();
    final when = DateFormat('d MMM, h:mm a');
    final photos = o.log.where((l) => l.photoUrl.isNotEmpty).length;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Packing', style: TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        Text(
          o.status == 'packed' && o.packedAt != null
              ? 'Packed by ${o.packedBy.isEmpty ? 'someone' : o.packedBy} on ${when.format(o.packedAt!)}'
              : started
                  ? '${o.ticked} of ${o.items.length} products ticked'
                  : 'Sent to packing. Not started yet.',
          style: TextStyle(fontSize: 12.5, color: Colors.grey.shade600),
        ),
        if (o.status != 'packed') ...[
          const SizedBox(height: 6),
          Row(children: [
            Text('Assigned to ', style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
            Expanded(
              child: Text(o.assignedTo.isEmpty ? 'Nobody (whole team)' : o.assignedTo,
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
            ),
            if (widget.canEdit)
              TextButton(onPressed: _busy ? null : _reassign, child: Text(_busy ? 'Saving…' : 'Change')),
          ]),
        ],
        const SizedBox(height: 6),
        for (final it in o.items) _item(it),
        if (o.log.isNotEmpty)
          TextButton.icon(
            onPressed: () => setState(() => _showLog = !_showLog),
            icon: Icon(_showLog ? Icons.expand_less : Icons.expand_more, size: 18),
            label: Text(_showLog ? 'Hide packing log' : 'Packing log (${o.log.length} steps, $photos photo${photos == 1 ? '' : 's'})'),
          ),
        if (_showLog)
          for (final l in o.log)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                SizedBox(
                  width: 92,
                  child: Text(l.at == null ? '' : when.format(l.at!), style: TextStyle(fontSize: 11.5, color: Colors.grey.shade500)),
                ),
                Expanded(
                  child: Text(
                    [
                      '${_action[l.action] ?? l.action}${l.product.isNotEmpty ? ' · ${l.product}' : ''}',
                      if (l.detail.isNotEmpty) l.detail,
                      if (l.user.isNotEmpty) l.user,
                    ].join(' — '),
                    style: const TextStyle(fontSize: 12.5),
                  ),
                ),
                if (l.photoUrl.isNotEmpty)
                  GestureDetector(
                    onTap: () => _openPhoto(l.photoUrl, l.product.isEmpty ? 'Batch photo' : l.product),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: CachedNetworkImage(imageUrl: l.photoUrl, width: 40, height: 40, fit: BoxFit.cover),
                    ),
                  ),
              ]),
            ),
      ]),
    );
  }

  Widget _item(PackingItem it) {
    final r = _result[it.result];
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        GestureDetector(
          onTap: it.photoUrl.isEmpty ? null : () => _openPhoto(it.photoUrl, it.productName),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: it.photoUrl.isEmpty
                ? Container(width: 52, height: 52, color: Colors.grey.shade100, child: Icon(Icons.photo_camera_outlined, color: Colors.grey.shade400))
                : CachedNetworkImage(imageUrl: it.photoUrl, width: 52, height: 52, fit: BoxFit.cover),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${it.productName} × ${it.quantity}', style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500)),
            InventoryCodeTag(it.inventoryCode),
            const SizedBox(height: 2),
            Text(
              [
                if (it.expectedBatch.isNotEmpty) 'Expected ${it.expectedBatch}',
                if (it.readBatch.isNotEmpty) 'Read ${it.readBatch}${it.readExpiry.isNotEmpty ? ' (exp ${it.readExpiry})' : ''}',
                if (it.result.isEmpty) 'No photo yet',
              ].join(' · '),
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            ),
            if (it.overridden)
              Text('Allowed by ${it.overrideBy}: ${it.overrideReason}', style: TextStyle(fontSize: 12, color: Colors.amber.shade800)),
          ]),
        ),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          if (r != null) Text(r.$1, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: r.$2)),
          if (it.packed)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.check_circle, size: 14, color: _teal),
                const SizedBox(width: 3),
                Text(it.packedBy.isEmpty ? 'Ticked' : it.packedBy, style: const TextStyle(fontSize: 11.5, color: _teal)),
              ]),
            ),
        ]),
      ]),
    );
  }
}
