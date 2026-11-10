import 'package:flutter/material.dart';
import '../../models/retailer.dart';
import '../../services/retailer_service.dart';
import '../../widgets/doc_verify_dialogs.dart';
import '../../widgets/scraped_details.dart';

/// Partner: a retailer's GST number and drug licences. Each can be checked
/// against the government portal (GST needs its captcha) or saved
/// unchecked; the portal's details are kept with it.
class RetailerDocumentsScreen extends StatefulWidget {
  final Retailer retailer;
  const RetailerDocumentsScreen({super.key, required this.retailer});

  @override
  State<RetailerDocumentsScreen> createState() => _RetailerDocumentsScreenState();
}

class _RetailerDocumentsScreenState extends State<RetailerDocumentsScreen> {
  static const _teal = Color(0xFF00A6A4);
  final _service = RetailerService();
  List<RetailerDocument>? _docs;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final docs = await _service.getDocuments(widget.retailer.id);
      if (mounted) setState(() { _docs = docs; _error = null; });
    } catch (e) {
      if (mounted) setState(() { _docs ??= []; _error = RetailerService.messageOf(e); });
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

  // Runs the portal check; returns its details, or null if dismissed.
  Future<Map<String, dynamic>?> _check(String kind, String number) => showDialog<Map<String, dynamic>>(
        context: context,
        builder: (_) => kind == 'gst' ? GstVerifyDialog(gstin: number) : DlVerifyDialog(licenseNo: number),
      );

  Future<void> _save(String kind, String number, {Map<String, dynamic>? details}) async {
    try {
      final msg = await _service.saveDocument(widget.retailer.id, kind: kind, number: number, details: details);
      _snack(msg);
      await _load();
    } catch (e) {
      _snack(RetailerService.messageOf(e), error: true);
    }
  }

  // Enter a number, then check it (or save it unchecked).
  Future<void> _add(String kind) async {
    final ctrl = TextEditingController();
    final isGst = kind == 'gst';
    final action = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(isGst ? 'GST number' : 'Drug licence number'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          textCapitalization: TextCapitalization.characters,
          decoration: InputDecoration(hintText: isGst ? '15-character GSTIN' : 'e.g. PB-LDH-123456'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, 'save'), child: const Text('Save without checking')),
          TextButton(onPressed: () => Navigator.pop(ctx, 'check'), child: const Text('Check', style: TextStyle(color: _teal))),
        ],
      ),
    );
    final number = ctrl.text.trim().toUpperCase();
    if (action == null || number.isEmpty) return;
    if (action == 'save') return _save(kind, number);
    final details = await _check(kind, number);
    if (details != null) await _save(kind, number, details: details);
  }

  Future<void> _recheck(RetailerDocument d) async {
    final details = await _check(d.kind, d.number);
    if (details != null) await _save(d.kind, d.number, details: details);
  }

  Future<void> _delete(RetailerDocument d) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove this number?'),
        content: Text(d.number),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Remove', style: TextStyle(color: Colors.red))),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await _service.deleteDocument(widget.retailer.id, d.id);
      _snack('The number has been removed.');
      await _load();
    } catch (e) {
      _snack(RetailerService.messageOf(e), error: true);
    }
  }

  Widget _card(RetailerDocument d) {
    final checked = d.verifiedAt != null;
    final when = d.verifiedAt?.toLocal();
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Text(d.kind == 'gst' ? 'GST' : 'Drug licence', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
          const SizedBox(width: 8),
          Icon(checked ? Icons.verified : Icons.help_outline, size: 16, color: checked ? Colors.green.shade700 : Colors.orange.shade700),
          const SizedBox(width: 4),
          Text(
            checked ? 'Checked ${when!.day}/${when.month}/${when.year}' : 'Not checked',
            style: TextStyle(fontSize: 12, color: checked ? Colors.green.shade700 : Colors.orange.shade700),
          ),
          const Spacer(),
          PopupMenuButton<String>(
            onSelected: (v) => v == 'check' ? _recheck(d) : _delete(d),
            itemBuilder: (_) => [
              PopupMenuItem(value: 'check', child: Text(checked ? 'Check again' : 'Check now')),
              const PopupMenuItem(value: 'delete', child: Text('Remove', style: TextStyle(color: Colors.red))),
            ],
          ),
        ]),
        Text(d.number, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
        if (d.details != null) ...[
          const SizedBox(height: 8),
          ScrapedDetails(data: d.details, style: TextStyle(fontSize: 12, color: Colors.grey.shade800)),
        ],
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final docs = _docs;
    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: Colors.black,
        title: Text(widget.retailer.displayName, style: const TextStyle(fontWeight: FontWeight.w600)),
      ),
      body: docs == null
          ? const Center(child: CircularProgressIndicator(color: _teal))
          : RefreshIndicator(
              onRefresh: _load,
              color: _teal,
              child: ListView(padding: const EdgeInsets.all(16), children: [
                Text('GST & drug licences', style: TextStyle(fontSize: 13, color: Colors.grey.shade700, fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                Text('Check a number against the government portal to see the registered name, status and validity.',
                    style: TextStyle(fontSize: 12.5, color: Colors.grey.shade600)),
                const SizedBox(height: 12),
                if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 10), child: Text(_error!, style: const TextStyle(color: Colors.red))),
                ...docs.map(_card),
                if (docs.isEmpty && _error == null)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 20),
                    child: Text('No numbers saved yet.', textAlign: TextAlign.center, style: TextStyle(color: Colors.grey.shade500)),
                  ),
                const SizedBox(height: 8),
                Row(children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: docs.any((d) => d.kind == 'gst') ? null : () => _add('gst'),
                      icon: const Icon(Icons.add, size: 18),
                      label: const Text('GST number'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _add('dl'),
                      icon: const Icon(Icons.add, size: 18),
                      label: const Text('Drug licence'),
                    ),
                  ),
                ]),
              ]),
            ),
    );
  }
}
