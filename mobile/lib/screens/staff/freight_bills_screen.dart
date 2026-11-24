import 'dart:typed_data';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../providers/auth_provider.dart';
import '../../services/staff_service.dart';
import '../../widgets/shell_leading.dart';

const _teal = Color(0xFF00A6A4);
final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 2);

/// Freight bills (internal/dispatch, migration 190): the dispatch team
/// records each transporter's bill — a photo or PDF of it, bill no. and
/// date, what was paid, how and by whom, and remarks. A member sees the
/// bills they added; admins (and freight_bills_view) see everyone's.
class FreightBillsScreen extends ConsumerStatefulWidget {
  const FreightBillsScreen({super.key});

  @override
  ConsumerState<FreightBillsScreen> createState() => _FreightBillsScreenState();
}

class _FreightBillsScreenState extends ConsumerState<FreightBillsScreen> {
  final _service = StaffService();
  FreightList? _list;
  bool _loading = true;
  String? _error;
  DateTime _from = DateTime(DateTime.now().year, DateTime.now().month);
  DateTime _to = DateTime.now();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => (_loading = true, _error = null));
    final f = DateFormat('yyyy-MM-dd');
    try {
      final l = await _service.freightBills(from: f.format(_from), to: f.format(_to));
      if (mounted) setState(() => _list = l);
    } catch (e) {
      if (mounted) setState(() => _error = staffError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pickRange() async {
    final r = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2024),
      lastDate: DateTime.now().add(const Duration(days: 1)),
      initialDateRange: DateTimeRange(start: _from, end: _to),
    );
    if (r == null) return;
    setState(() => (_from = r.start, _to = r.end));
    _load();
  }

  Future<void> _edit([FreightBill? bill]) async {
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => FreightBillFormScreen(bill: bill)),
    );
    if (saved == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final canAdd = user?.has('freight_bills_edit') ?? false;
    final fmt = DateFormat('d MMM');
    return Scaffold(
      appBar: AppBar(leading: const ShellBack(), title: const Text('Freight Bills')),
      floatingActionButton: canAdd
          ? FloatingActionButton.extended(
              backgroundColor: _teal,
              foregroundColor: Colors.white,
              onPressed: () => _edit(),
              icon: const Icon(Icons.add),
              label: const Text('Add bill'),
            )
          : null,
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
          child: Row(children: [
            OutlinedButton.icon(
              onPressed: _pickRange,
              icon: const Icon(Icons.date_range, size: 18),
              label: Text('${fmt.format(_from)} – ${fmt.format(_to)}'),
            ),
            const Spacer(),
            if (_list != null)
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text(_inr.format(_list!.total), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                Text('${_list!.bills.length} bill${_list!.bills.length == 1 ? '' : 's'}${_list!.all ? '' : ' (yours)'}',
                    style: TextStyle(fontSize: 11.5, color: Colors.grey.shade600)),
              ]),
          ]),
        ),
        Expanded(child: _body(user?.id)),
      ]),
    );
  }

  Widget _body(String? me) {
    if (_loading) return const Center(child: CircularProgressIndicator(color: _teal));
    if (_error != null) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(padding: const EdgeInsets.all(16), child: Text(_error!, textAlign: TextAlign.center)),
          OutlinedButton(onPressed: _load, child: const Text('Try again')),
        ]),
      );
    }
    final bills = _list?.bills ?? [];
    if (bills.isEmpty) return Center(child: Text('No freight bills in these dates.', style: TextStyle(color: Colors.grey.shade500)));
    final isAdmin = ref.read(authProvider).user?.role == 'admin';
    return RefreshIndicator(
      color: _teal,
      onRefresh: _load,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(12, 4, 12, 96),
        itemCount: bills.length,
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (context, i) {
          final b = bills[i];
          final mine = b.createdById == me;
          return Card(
            elevation: 0,
            margin: EdgeInsets.zero,
            shape: RoundedRectangleBorder(side: BorderSide(color: Colors.grey.shade200), borderRadius: BorderRadius.circular(12)),
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: (mine || isAdmin) ? () => _edit(b) : () => openFreightFile(context, b),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  GestureDetector(onTap: () => openFreightFile(context, b), child: _thumb(b)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Expanded(
                          child: Text(b.transporter.isEmpty ? 'Transporter not set' : b.transporter,
                              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
                        ),
                        Text(_inr.format(b.amountPaid), style: const TextStyle(fontWeight: FontWeight.w700)),
                      ]),
                      const SizedBox(height: 3),
                      Text(
                        [
                          if (b.billNo.isNotEmpty) 'Bill ${b.billNo}',
                          if (b.billDate != null) DateFormat('d MMM yyyy').format(b.billDate!),
                          freightPaymentModes[b.paymentMode] ?? b.paymentMode,
                          if (b.paidBy.isNotEmpty) 'paid by ${b.paidBy}',
                        ].join(' · '),
                        style: TextStyle(fontSize: 12.5, color: Colors.grey.shade700),
                      ),
                      if (b.remarks.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 3),
                          child: Text(b.remarks, style: TextStyle(fontSize: 12.5, color: Colors.grey.shade600)),
                        ),
                      if (_list!.all && b.createdBy.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 3),
                          child: Text('Added by ${b.createdBy}', style: TextStyle(fontSize: 11.5, color: Colors.grey.shade500)),
                        ),
                    ]),
                  ),
                ]),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _thumb(FreightBill b) => ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: SizedBox(
          width: 56,
          height: 56,
          child: b.isPdf
              ? Container(color: Colors.red.shade50, child: Icon(Icons.picture_as_pdf, color: Colors.red.shade700))
              : CachedNetworkImage(
                  imageUrl: b.fileUrl,
                  fit: BoxFit.cover,
                  errorWidget: (_, __, ___) => Container(color: Colors.grey.shade100, child: const Icon(Icons.receipt_long)),
                ),
        ),
      );
}

/// Opens a bill's file: a photo full screen in the app, a PDF in the
/// phone's viewer.
Future<void> openFreightFile(BuildContext context, FreightBill b) async {
  if (b.fileUrl.isEmpty) return;
  if (b.isPdf) {
    await launchUrl(Uri.parse(b.fileUrl), mode: LaunchMode.externalApplication);
    return;
  }
  await Navigator.of(context).push(MaterialPageRoute(
    builder: (_) => Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(leading: const ShellBack(), backgroundColor: Colors.black, foregroundColor: Colors.white, title: Text(b.billNo.isEmpty ? 'Freight bill' : 'Bill ${b.billNo}')),
      body: InteractiveViewer(maxScale: 5, child: Center(child: CachedNetworkImage(imageUrl: b.fileUrl))),
    ),
  ));
}

/// Adds a freight bill, or changes one (the person who added it, or an admin).
class FreightBillFormScreen extends ConsumerStatefulWidget {
  final FreightBill? bill;
  const FreightBillFormScreen({super.key, this.bill});

  @override
  ConsumerState<FreightBillFormScreen> createState() => _FreightBillFormScreenState();
}

class _FreightBillFormScreenState extends ConsumerState<FreightBillFormScreen> {
  final _service = StaffService();
  final _billNo = TextEditingController();
  final _amount = TextEditingController();
  final _paidBy = TextEditingController();
  final _remarks = TextEditingController();
  final _transporterName = TextEditingController();
  DateTime? _billDate;
  String _mode = 'cash';
  String _transportId = '';
  List<Map<String, dynamic>> _transports = [];
  Uint8List? _fileBytes;
  String _fileName = '';
  String _contentType = '';
  bool _busy = false;
  String? _error;

  bool get _editing => widget.bill != null;

  @override
  void initState() {
    super.initState();
    final b = widget.bill;
    if (b != null) {
      _billNo.text = b.billNo;
      _amount.text = b.amountPaid == b.amountPaid.roundToDouble() ? b.amountPaid.toStringAsFixed(0) : b.amountPaid.toString();
      _paidBy.text = b.paidBy;
      _remarks.text = b.remarks;
      _billDate = b.billDate;
      _mode = freightPaymentModes.containsKey(b.paymentMode) ? b.paymentMode : 'other';
      _transportId = b.transportId;
      if (b.transportId.isEmpty) _transporterName.text = b.transporter;
    } else {
      _billDate = DateTime.now();
      final u = ref.read(authProvider).user;
      _paidBy.text = (u?.username?.isNotEmpty ?? false) ? u!.username! : '';
    }
    _service.transports().then((t) {
      if (mounted) setState(() => _transports = t..sort((a, b) => '${a['name']}'.compareTo('${b['name']}')));
    }).catchError((_) {});
  }

  @override
  void dispose() {
    for (final c in [_billNo, _amount, _paidBy, _remarks, _transporterName]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _pickFile() async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(leading: const Icon(Icons.photo_camera), title: const Text('Take a photo'), onTap: () => Navigator.pop(ctx, 'camera')),
          ListTile(leading: const Icon(Icons.photo_library), title: const Text('Choose a photo'), onTap: () => Navigator.pop(ctx, 'gallery')),
          ListTile(leading: const Icon(Icons.picture_as_pdf), title: const Text('Choose a PDF'), onTap: () => Navigator.pop(ctx, 'pdf')),
        ]),
      ),
    );
    if (choice == null) return;
    try {
      if (choice == 'pdf') {
        final res = await FilePicker.pickFiles(type: FileType.custom, allowedExtensions: ['pdf'], withData: true);
        final f = res?.files.firstOrNull;
        if (f == null || f.bytes == null) return;
        setState(() => (_fileBytes = f.bytes, _fileName = f.name, _contentType = 'application/pdf'));
      } else {
        final x = await ImagePicker().pickImage(
          source: choice == 'camera' ? ImageSource.camera : ImageSource.gallery,
          imageQuality: 80,
          maxWidth: 2000,
        );
        if (x == null) return;
        final bytes = await x.readAsBytes();
        setState(() => (_fileBytes = bytes, _fileName = 'freight-bill.jpg', _contentType = 'image/jpeg'));
      }
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not open that file.')));
    }
  }

  Future<void> _save() async {
    final amount = double.tryParse(_amount.text.replaceAll(',', '').trim());
    if (!_editing && _fileBytes == null) return setState(() => _error = 'Add a photo or PDF of the bill.');
    if (_transportId.isEmpty && _transporterName.text.trim().isEmpty) return setState(() => _error = 'Pick or type the transporter.');
    if (amount == null || amount < 0) return setState(() => _error = 'Enter the amount paid.');
    setState(() => (_busy = true, _error = null));
    try {
      var key = '';
      if (_fileBytes != null) key = await _service.uploadFreightFile(_fileBytes!, _fileName, _contentType);
      await _service.saveFreightBill(id: widget.bill?.id, data: {
        'bill_no': _billNo.text.trim(),
        'bill_date': _billDate == null ? '' : DateFormat('yyyy-MM-dd').format(_billDate!),
        'transport_id': _transportId,
        'transporter_name': _transportId.isEmpty ? _transporterName.text.trim() : '',
        'amount_paid': amount,
        'payment_mode': _mode,
        'paid_by': _paidBy.text.trim(),
        'remarks': _remarks.text.trim(),
        'file_key': key,
        'file_name': key.isEmpty ? '' : _fileName,
        'content_type': key.isEmpty ? '' : _contentType,
      });
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => (_busy = false, _error = staffError(e)));
    }
  }

  Future<void> _delete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove this freight bill?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: Text('Remove', style: TextStyle(color: Colors.red.shade700))),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      await _service.deleteFreightBill(widget.bill!.id);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => (_busy = false, _error = staffError(e)));
    }
  }

  @override
  Widget build(BuildContext context) {
    const gap = SizedBox(height: 12);
    InputDecoration deco(String label) => InputDecoration(labelText: label, border: const OutlineInputBorder(), isDense: true);
    final known = _transports.any((t) => t['id'] == _transportId);
    return Scaffold(
      appBar: AppBar(leading: const ShellBack(), 
        title: Text(_editing ? 'Freight bill' : 'Add freight bill'),
        actions: [if (_editing) IconButton(icon: const Icon(Icons.delete_outline), onPressed: _busy ? null : _delete)],
      ),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
        // the bill itself
        InkWell(
          onTap: _pickFile,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            height: 170,
            decoration: BoxDecoration(
              color: Colors.grey.shade50,
              border: Border.all(color: Colors.grey.shade300),
              borderRadius: BorderRadius.circular(12),
            ),
            clipBehavior: Clip.antiAlias,
            child: _fileBytes != null
                ? (_contentType.contains('pdf')
                    ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                        Icon(Icons.picture_as_pdf, size: 42, color: Colors.red.shade700),
                        const SizedBox(height: 6),
                        Text(_fileName, textAlign: TextAlign.center),
                      ]))
                    : Image.memory(_fileBytes!, fit: BoxFit.cover, width: double.infinity))
                : (widget.bill != null
                    ? (widget.bill!.isPdf
                        ? Center(child: Icon(Icons.picture_as_pdf, size: 42, color: Colors.red.shade700))
                        : CachedNetworkImage(imageUrl: widget.bill!.fileUrl, fit: BoxFit.cover, width: double.infinity))
                    : Center(
                        child: Column(mainAxisSize: MainAxisSize.min, children: [
                          Icon(Icons.add_a_photo_outlined, size: 36, color: Colors.grey.shade500),
                          const SizedBox(height: 6),
                          Text('Photo or PDF of the bill', style: TextStyle(color: Colors.grey.shade600)),
                        ]),
                      )),
          ),
        ),
        if (widget.bill != null)
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            TextButton(onPressed: () => openFreightFile(context, widget.bill!), child: const Text('Open the bill')),
            TextButton(onPressed: _pickFile, child: const Text('Replace')),
          ]),
        gap,
        DropdownButtonFormField<String>(
          initialValue: known ? _transportId : '',
          isExpanded: true,
          decoration: deco('Transporter'),
          items: [
            const DropdownMenuItem(value: '', child: Text('Other (type the name)')),
            for (final t in _transports) DropdownMenuItem(value: '${t['id']}', child: Text('${t['name']}', overflow: TextOverflow.ellipsis)),
          ],
          onChanged: (v) => setState(() => _transportId = v ?? ''),
        ),
        if (_transportId.isEmpty || !known) ...[
          gap,
          TextField(controller: _transporterName, textCapitalization: TextCapitalization.words, decoration: deco('Transporter name')),
        ],
        gap,
        Row(children: [
          Expanded(child: TextField(controller: _billNo, decoration: deco('Bill no.'))),
          const SizedBox(width: 10),
          Expanded(
            child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              onPressed: () async {
                final d = await showDatePicker(
                  context: context,
                  initialDate: _billDate ?? DateTime.now(),
                  firstDate: DateTime(2024),
                  lastDate: DateTime.now().add(const Duration(days: 1)),
                );
                if (d != null) setState(() => _billDate = d);
              },
              icon: const Icon(Icons.event, size: 18),
              label: Text(_billDate == null ? 'Bill date' : DateFormat('d MMM yyyy').format(_billDate!)),
            ),
          ),
        ]),
        gap,
        TextField(
          controller: _amount,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: deco('Amount paid (₹)'),
        ),
        gap,
        const Text('Paid by', style: TextStyle(fontSize: 12.5, color: Colors.black54)),
        const SizedBox(height: 4),
        Wrap(spacing: 8, children: [
          for (final e in freightPaymentModes.entries)
            ChoiceChip(
              label: Text(e.value),
              selected: _mode == e.key,
              selectedColor: _teal.withValues(alpha: 0.15),
              onSelected: (_) => setState(() => _mode = e.key),
            ),
        ]),
        gap,
        TextField(controller: _paidBy, textCapitalization: TextCapitalization.words, decoration: deco('Who paid')),
        gap,
        TextField(
          controller: _remarks,
          maxLines: 3,
          textCapitalization: TextCapitalization.sentences,
          decoration: deco('Remarks'),
        ),
        if (_error != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_error!, style: TextStyle(color: Colors.red.shade700))),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _busy ? null : _save,
          style: FilledButton.styleFrom(backgroundColor: _teal, minimumSize: const Size.fromHeight(48)),
          child: Text(_busy ? 'Saving…' : 'Save'),
        ),
      ]),
    );
  }
}
