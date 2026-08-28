import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:go_router/go_router.dart';
import '../../models/doctor.dart';
import '../../models/meeting.dart';
import '../../models/product.dart';
import '../../services/doctor_service.dart';
import '../../services/meeting_service.dart';
import '../../services/product_service.dart';
import '../../utils/responsive.dart';

class DoctorDetailScreen extends StatefulWidget {
  final Doctor doctor;
  const DoctorDetailScreen({super.key, required this.doctor});

  @override
  State<DoctorDetailScreen> createState() => _DoctorDetailScreenState();
}

class _DoctorDetailScreenState extends State<DoctorDetailScreen> {
  static const teal = Color(0xFF00A6A4);
  List<DoctorProduct> _assigned = [];
  bool _loading = true;
  String? _removingId;
  final _service = DoctorService();

  List<Meeting> _meetings = [];
  bool _loadingMeetings = true;

  DateTime? _lastMeetingAt;
  String? _lastMeetingNotes;
  bool _editingMeeting = false;
  bool _savingMeeting = false;
  DateTime? _draftDate;
  final _notesCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _lastMeetingAt = widget.doctor.lastMeetingAt;
    _lastMeetingNotes = widget.doctor.lastMeetingNotes;
    _loadProducts();
    _loadMeetings();
  }

  Future<void> _loadMeetings() async {
    try {
      final meetings = await MeetingService().getMeetings(doctorId: widget.doctor.id);
      if (mounted) setState(() { _meetings = meetings; _loadingMeetings = false; });
    } catch (_) {
      if (mounted) setState(() => _loadingMeetings = false);
    }
  }

  @override
  void dispose() {
    _notesCtrl.dispose();
    super.dispose();
  }

  void _startEditMeeting() {
    setState(() {
      _draftDate = _lastMeetingAt ?? DateTime.now();
      _notesCtrl.text = _lastMeetingNotes ?? '';
      _editingMeeting = true;
    });
  }

  Future<void> _pickDraftDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _draftDate ?? DateTime.now(),
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
    );
    if (picked != null) setState(() => _draftDate = picked);
  }

  Future<void> _saveMeeting() async {
    setState(() => _savingMeeting = true);
    try {
      await _service.updateLastMeeting(
        widget.doctor.id,
        lastMeetingAt: _draftDate,
        notes: _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
      );
      setState(() {
        _lastMeetingAt = _draftDate;
        _lastMeetingNotes = _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim();
        _editingMeeting = false;
      });
    } catch (_) {
      _showError('Could not save last meeting');
    } finally {
      if (mounted) setState(() => _savingMeeting = false);
    }
  }

  Future<void> _loadProducts() async {
    try {
      final products = await _service.getDoctorProducts(widget.doctor.id);
      setState(() { _assigned = products; _loading = false; });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  Future<void> _removeProduct(String productId) async {
    if (_removingId != null) return;
    setState(() => _removingId = productId);
    try {
      await _service.removeDoctorProduct(widget.doctor.id, productId);
      setState(() {
        _assigned.removeWhere((p) => p.productId == productId);
        _removingId = null;
      });
    } catch (e) {
      setState(() => _removingId = null);
      _showError('Could not remove product');
    }
  }

  void _showError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: Colors.red, behavior: SnackBarBehavior.floating),
    );
  }

  void _showAddProductSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _AddProductSheet(
        doctorId: widget.doctor.id,
        alreadyAssigned: _assigned.map((p) => p.productId).toSet(),
        // Re-fetch from the server after each assign instead of mutating
        // _assigned locally — avoids the list drifting out of sync with the
        // backend (which is the source of duplicate-looking rows) if a tap
        // fires while a previous assign is still in flight.
        onAdded: (_) => _loadProducts(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.doctor;

    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: Colors.black,
        title: Text(d.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
        actions: [
          IconButton(
            icon: const Icon(Icons.calendar_today_outlined, color: Color(0xFF00A6A4), size: 20),
            tooltip: 'Schedule meeting',
            onPressed: () => context.push('/meetings?doctor_id=${d.id}'),
          ),
          IconButton(
            icon: const Icon(Icons.add, color: Color(0xFF00A6A4)),
            tooltip: 'Assign product',
            onPressed: _showAddProductSheet,
          ),
        ],
      ),
      body: ResponsiveCenter(child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Doctor info card
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
            child: Row(
              children: [
                Container(
                  width: 56, height: 56,
                  decoration: const BoxDecoration(color: Color(0xFFE8F8F8), shape: BoxShape.circle),
                  child: const Icon(Icons.person_outlined, color: Color(0xFF00A6A4), size: 28),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(d.name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                      if (d.clinicName != null) ...[
                        const SizedBox(height: 2),
                        Text(d.clinicName!, style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
                      ],
                      if (d.phone != null) ...[
                        const SizedBox(height: 2),
                        Text(d.phone!, style: TextStyle(fontSize: 13, color: Colors.grey.shade500)),
                      ],
                      if (d.dob != null) ...[
                        const SizedBox(height: 2),
                        Text('🎂 ${d.dob!.day}/${d.dob!.month}', style: TextStyle(fontSize: 13, color: Colors.grey.shade500)),
                      ],
                      if (d.anniversary != null) ...[
                        const SizedBox(height: 2),
                        Text('🎉 ${d.anniversary!.day}/${d.anniversary!.month}', style: TextStyle(fontSize: 13, color: Colors.grey.shade500)),
                      ],
                      if (d.clinicAddress != null) ...[
                        const SizedBox(height: 2),
                        Text('📍 ${d.clinicAddress}', style: TextStyle(fontSize: 13, color: Colors.grey.shade500)),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 12),

          // Last meeting card
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Last Meeting', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                    if (!_editingMeeting)
                      TextButton(
                        onPressed: _startEditMeeting,
                        style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 0)),
                        child: Text(_lastMeetingAt != null ? 'Edit' : '+ Add', style: const TextStyle(fontSize: 12.5, color: teal, fontWeight: FontWeight.w600)),
                      ),
                  ],
                ),
                const SizedBox(height: 8),
                if (_editingMeeting) ...[
                  GestureDetector(
                    onTap: _pickDraftDate,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      decoration: BoxDecoration(border: Border.all(color: Colors.grey.shade300), borderRadius: BorderRadius.circular(8)),
                      child: Row(
                        children: [
                          Icon(Icons.calendar_today, size: 15, color: Colors.grey.shade600),
                          const SizedBox(width: 8),
                          Text(
                            _draftDate != null
                                ? '${_draftDate!.day}/${_draftDate!.month}/${_draftDate!.year}'
                                : 'Select date',
                            style: const TextStyle(fontSize: 13.5),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _notesCtrl,
                    maxLines: 3,
                    style: const TextStyle(fontSize: 13),
                    decoration: InputDecoration(
                      hintText: 'Notes from the meeting...',
                      isDense: true,
                      filled: true,
                      fillColor: Colors.grey.shade50,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide(color: Colors.grey.shade200)),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      TextButton(
                        onPressed: _savingMeeting ? null : _saveMeeting,
                        style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 0)),
                        child: Text(_savingMeeting ? 'Saving...' : 'Save', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                      ),
                      const SizedBox(width: 16),
                      TextButton(
                        onPressed: () => setState(() => _editingMeeting = false),
                        style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 0)),
                        child: Text('Cancel', style: TextStyle(fontSize: 13, color: Colors.grey.shade500)),
                      ),
                    ],
                  ),
                ] else if (_lastMeetingAt != null) ...[
                  Text(
                    '${_lastMeetingAt!.day}/${_lastMeetingAt!.month}/${_lastMeetingAt!.year}',
                    style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500),
                  ),
                  if (_lastMeetingNotes != null && _lastMeetingNotes!.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(_lastMeetingNotes!, style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
                  ],
                ] else
                  Text('No meeting recorded yet', style: TextStyle(fontSize: 13, color: Colors.grey.shade400)),
              ],
            ),
          ),

          const SizedBox(height: 12),

          // Meetings booked with this doctor
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Meetings with this Doctor${_meetings.isNotEmpty ? ' (${_meetings.length})' : ''}', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                const SizedBox(height: 10),
                if (_loadingMeetings)
                  const Center(child: Padding(padding: EdgeInsets.symmetric(vertical: 8), child: CircularProgressIndicator(strokeWidth: 2, color: teal)))
                else if (_meetings.isEmpty)
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('No meetings booked yet', style: TextStyle(fontSize: 13, color: Colors.grey.shade400)),
                      const SizedBox(height: 6),
                      TextButton(
                        onPressed: () => context.push('/meetings?doctor_id=${d.id}'),
                        style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 0)),
                        child: const Text('Schedule one', style: TextStyle(fontSize: 13, color: teal, fontWeight: FontWeight.w600)),
                      ),
                    ],
                  )
                else
                  Column(
                    children: _meetings.map((m) {
                      final statusColor = m.status == 'completed'
                          ? Colors.green
                          : m.status == 'cancelled'
                              ? Colors.grey
                              : teal;
                      return InkWell(
                        onTap: () => context.push('/meetings?doctor_id=${d.id}'),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 6),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      '${m.scheduledAt.day}/${m.scheduledAt.month}/${m.scheduledAt.year} · ${m.scheduledAt.hour.toString().padLeft(2, '0')}:${m.scheduledAt.minute.toString().padLeft(2, '0')}',
                                      style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500),
                                    ),
                                    if (m.notes != null && m.notes!.isNotEmpty)
                                      Text(m.notes!, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                                  ],
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(color: statusColor.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(20)),
                                child: Text(m.status, style: TextStyle(fontSize: 10.5, color: statusColor, fontWeight: FontWeight.w600)),
                              ),
                            ],
                          ),
                        ),
                      );
                    }).toList(),
                  ),
              ],
            ),
          ),

          const SizedBox(height: 20),

          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Assigned Products (${_assigned.length})',
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
              TextButton.icon(
                icon: const Icon(Icons.add, size: 16, color: Color(0xFF00A6A4)),
                label: const Text('Assign', style: TextStyle(color: Color(0xFF00A6A4), fontSize: 13)),
                onPressed: _showAddProductSheet,
              ),
            ],
          ),
          const SizedBox(height: 8),

          if (_loading)
            const Center(child: CircularProgressIndicator(color: Color(0xFF00A6A4)))
          else if (_assigned.isEmpty)
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
              child: Column(
                children: [
                  Icon(Icons.medication_outlined, size: 48, color: Colors.grey.shade300),
                  const SizedBox(height: 12),
                  const Text('No products assigned yet', style: TextStyle(color: Colors.grey)),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: _showAddProductSheet,
                    child: const Text('Assign a product', style: TextStyle(color: Color(0xFF00A6A4))),
                  ),
                ],
              ),
            )
          else
            Container(
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
              child: Column(
                children: _assigned.asMap().entries.map((entry) {
                  final p = entry.value;
                  return Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      border: entry.key < _assigned.length - 1
                          ? Border(bottom: BorderSide(color: Colors.grey.shade100))
                          : null,
                    ),
                    child: Row(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: p.imageUrl != null
                              ? CachedNetworkImage(
                                  imageUrl: p.imageUrl!,
                                  width: 48, height: 48,
                                  fit: BoxFit.cover,
                                  errorWidget: (_, __, ___) => _productPlaceholder(),
                                )
                              : _productPlaceholder(),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: InkWell(
                            onTap: () => context.push('/products/${p.productId}'),
                            child: Text(
                              p.productName,
                              style: const TextStyle(
                                fontWeight: FontWeight.w500,
                                fontSize: 14,
                                color: Color(0xFF00A6A4),
                                decoration: TextDecoration.underline,
                                decorationColor: Color(0xFF00A6A4),
                              ),
                            ),
                          ),
                        ),
                        _removingId == p.productId
                            ? const Padding(
                                padding: EdgeInsets.all(10),
                                child: SizedBox(
                                  width: 18, height: 18,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.red),
                                ),
                              )
                            : IconButton(
                                icon: const Icon(Icons.remove_circle_outline, color: Colors.red, size: 20),
                                onPressed: () async {
                                  final confirm = await showDialog<bool>(
                                    context: context,
                                    builder: (dialogContext) => AlertDialog(
                                      title: const Text('Remove product?'),
                                      content: Text('Remove "${p.productName}" from Dr. ${d.name}?'),
                                      actions: [
                                        TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
                                        TextButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Remove', style: TextStyle(color: Colors.red))),
                                      ],
                                    ),
                                  );
                                  if (confirm == true) _removeProduct(p.productId);
                                },
                              ),
                      ],
                    ),
                  );
                }).toList(),
              ),
            ),
        ],
      )),
    );
  }

  Widget _productPlaceholder() => Container(
        width: 48, height: 48,
        color: Colors.grey.shade100,
        child: const Icon(Icons.medication_outlined, color: Colors.grey, size: 22),
      );
}

// ── Bottom sheet to pick and assign a product ──────────────────────────────
class _AddProductSheet extends StatefulWidget {
  final String doctorId;
  final Set<String> alreadyAssigned;
  final void Function(Product) onAdded;

  const _AddProductSheet({
    required this.doctorId,
    required this.alreadyAssigned,
    required this.onAdded,
  });

  @override
  State<_AddProductSheet> createState() => _AddProductSheetState();
}

class _AddProductSheetState extends State<_AddProductSheet> {
  final _searchCtrl = TextEditingController();
  final _productService = ProductService();
  final _doctorService = DoctorService();
  List<Product> _products = [];
  bool _loading = true;
  String _search = '';
  String? _assigningId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await _productService.getProducts(limit: 0, search: _search);
      setState(() { _products = res.products; _loading = false; });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  Future<void> _assign(Product product) async {
    if (_assigningId != null) return;
    setState(() => _assigningId = product.id);
    try {
      await _doctorService.addDoctorProduct(widget.doctorId, product.id);
      widget.onAdded(product);
      if (mounted) Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${product.name} assigned'), backgroundColor: const Color(0xFF00A6A4), behavior: SnackBarBehavior.floating),
      );
    } catch (_) {
      if (mounted) setState(() => _assigningId = null);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not assign product'), backgroundColor: Colors.red, behavior: SnackBarBehavior.floating),
      );
    }
  }

  List<Product> get _filtered {
    final q = _search.toLowerCase();
    return _products
        .where((p) => !widget.alreadyAssigned.contains(p.id))
        .where((p) => q.isEmpty || p.name.toLowerCase().contains(q))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.8,
      maxChildSize: 0.95,
      minChildSize: 0.5,
      expand: false,
      builder: (_, scrollCtrl) => Column(
        children: [
          const SizedBox(height: 12),
          Container(width: 36, height: 4, decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2))),
          const SizedBox(height: 16),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 20),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text('Assign Product', style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
            ),
          ),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: TextField(
              controller: _searchCtrl,
              onChanged: (v) => setState(() => _search = v),
              decoration: InputDecoration(
                hintText: 'Search products...',
                prefixIcon: const Icon(Icons.search, color: Colors.grey),
                filled: true,
                fillColor: Colors.grey.shade50,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade200)),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade200)),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF00A6A4))),
                contentPadding: const EdgeInsets.symmetric(vertical: 0),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: Color(0xFF00A6A4)))
                : _filtered.isEmpty
                    ? Center(child: Text(_search.isEmpty ? 'All products already assigned' : 'No products found', style: const TextStyle(color: Colors.grey)))
                    : ListView.separated(
                        controller: scrollCtrl,
                        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                        itemCount: _filtered.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (_, i) {
                          final p = _filtered[i];
                          return ListTile(
                            contentPadding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                            leading: ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: p.primaryImageUrl != null
                                  ? CachedNetworkImage(imageUrl: p.primaryImageUrl!, width: 44, height: 44, fit: BoxFit.cover, errorWidget: (_, __, ___) => Container(width: 44, height: 44, color: Colors.grey.shade100, child: const Icon(Icons.medication_outlined, color: Colors.grey)))
                                  : Container(width: 44, height: 44, color: Colors.grey.shade100, child: const Icon(Icons.medication_outlined, color: Colors.grey)),
                            ),
                            title: Text(p.name, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                            subtitle: p.categories.isNotEmpty ? Text(p.categories.first, style: const TextStyle(fontSize: 12, color: Color(0xFF00A6A4))) : null,
                            trailing: ElevatedButton(
                              onPressed: _assigningId == null ? () => _assign(p) : null,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF00A6A4),
                                foregroundColor: Colors.white,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                elevation: 0,
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                                minimumSize: Size.zero,
                                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                              ),
                              child: _assigningId == p.id
                                  ? const SizedBox(
                                      width: 14, height: 14,
                                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                    )
                                  : const Text('Assign', style: TextStyle(fontSize: 13)),
                            ),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }
}
