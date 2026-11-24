import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/auth_provider.dart';
import '../../models/doctor.dart';
import '../../models/meeting.dart';
import '../../models/presentation.dart';
import '../../models/product.dart';
import '../../services/doctor_service.dart';
import '../../services/meeting_service.dart';
import '../../services/presentation_service.dart';
import '../../services/product_service.dart';
import '../../utils/responsive.dart';
import '../../widgets/presentation_download_button.dart';
import '../../services/presentation_downloads.dart';
import '../../services/offline_sync.dart';
import '../presentations/present.dart';
import 'doctor_form_sheet.dart';
import '../../widgets/shell_leading.dart';

/// Pops with `true` when the doctor was deleted, so the list can drop them.
class DoctorDetailScreen extends ConsumerStatefulWidget {
  final Doctor doctor;
  const DoctorDetailScreen({super.key, required this.doctor});

  @override
  ConsumerState<DoctorDetailScreen> createState() => _DoctorDetailScreenState();
}

class _DoctorDetailScreenState extends ConsumerState<DoctorDetailScreen> {
  static const teal = Color(0xFF00A6A4);
  List<DoctorProduct> _assigned = [];
  bool _loading = true;
  String? _removingId;
  final _service = DoctorService();
  final _presentationService = PresentationService();
  bool _generatingPresentation = false;
  List<Presentation> _presentations = [];
  bool _loadingPresentations = true;
  late Doctor _doctor;

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
    _doctor = widget.doctor;
    _lastMeetingAt = widget.doctor.lastMeetingAt;
    _lastMeetingNotes = widget.doctor.lastMeetingNotes;
    _loadProducts();
    _loadMeetings();
    _loadPresentations();
  }

  Future<void> _loadPresentations() async {
    try {
      final all = await _presentationService.getPresentations();
      if (mounted) {
        setState(() {
          _presentations = all.where((p) => p.doctorId == _doctor.id).toList();
          // keep this doctor's decks on the phone so they play offline
          if (OfflineSync.smartNow) PresentationDownloads.keepDownloaded(_presentations, _presentationService.getPresentation);
          _loadingPresentations = false;
        });
      }
    } catch (_) {
      // No internet: this doctor's downloaded presentations.
      final saved = (await PresentationDownloads.list()).where((d) => d.doctorId == _doctor.id).map((d) => d.asPresentation).toList();
      if (mounted) {
        setState(() {
          _presentations = saved;
          _loadingPresentations = false;
        });
      }
    }
  }

  // Plays a deck straight from here: the downloaded copy if there is one
  // (works offline), else loaded now.
  Future<void> _play(Presentation p) async {
    List<PresentationSlide> slides;
    final saved = await PresentationDownloads.get(p.id);
    try {
      slides = saved?.slides ?? (await _presentationService.getPresentation(p.id)).slides;
    } catch (_) {
      _showError('This presentation is not downloaded on this phone. Please connect to the internet and try again.');
      return;
    }
    if (slides.isEmpty) {
      _showError('This presentation has no slides yet.');
      return;
    }
    final notebook = await notebookPreferred();
    if (mounted) presentSlides(context, slides, notebook: notebook);
  }

  Future<void> _generatePresentation() async {
    setState(() => _generatingPresentation = true);
    try {
      final id = await _presentationService.generateDefaultForDoctor(_doctor.id);
      if (mounted) await context.push('/presentations/$id');
      _loadPresentations();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not generate presentation: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _generatingPresentation = false);
    }
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
      // this doctor's products, in full, on the phone
      if (OfflineSync.smartNow) DoctorService.saveProductsForOffline(products.map((p) => p.productId));
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

  Future<void> _showEditSheet() async {
    final saved = await showDoctorFormSheet(context, existing: _doctor);
    if (saved != null && mounted) setState(() => _doctor = saved);
  }

  // Only the partner may delete a doctor (the server refuses team members).
  // The doctor is marked deleted, not erased: past meetings and visit
  // records stay, and their upcoming meetings stop sending reminders.
  Future<void> _deleteDoctor() async {
    final name = _doctor.name;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete doctor?'),
        content: Text(
            'Dr. $name will be removed from your doctor list, and reminders for their upcoming meetings will stop. '
            'Their past meetings and visit records will be kept.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    try {
      await _service.deleteDoctor(_doctor.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Dr. $name has been deleted.'),
        backgroundColor: teal,
        behavior: SnackBarBehavior.floating,
      ));
      Navigator.pop(context, true);
    } catch (_) {
      _showError('The doctor could not be deleted. Please check your internet connection and try again.');
    }
  }

  void _showAddProductSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _AddProductSheet(
        doctorId: widget.doctor.id,
        alreadyAssigned: _assigned.map((p) => p.productId).toSet(),
        // Re-fetch from the server after assigning instead of mutating
        // _assigned locally — avoids the list drifting out of sync with the
        // backend (which is the source of duplicate-looking rows) if a tap
        // fires while a previous assign is still in flight.
        onAdded: (_) => _loadProducts(),
      ),
    );
  }

  // which boxes on this page are open; the arrow on each box flips it
  final Map<String, bool> _open = {
    'info': true,
    'last': true,
    'meetings': false,
    'presentations': true,
    'products': true,
  };

  Widget _section({
    required String id,
    required String title,
    int? count,
    Widget? action,
    required Widget child,
  }) {
    final open = _open[id] ?? true;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        InkWell(
          onTap: () => setState(() => _open[id] = !open),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 6, 6, 6),
            child: Row(children: [
              Expanded(
                child: Text(count != null && count > 0 ? '$title ($count)' : title,
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
              ),
              if (action != null) action,
              AnimatedRotation(
                turns: open ? 0.5 : 0,
                duration: const Duration(milliseconds: 200),
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: Icon(Icons.keyboard_arrow_down, color: Colors.grey.shade600),
                ),
              ),
            ]),
          ),
        ),
        AnimatedSize(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
          alignment: Alignment.topCenter,
          child: open
              ? Padding(padding: const EdgeInsets.fromLTRB(14, 0, 14, 12), child: child)
              : const SizedBox(width: double.infinity),
        ),
      ]),
    );
  }

  Widget _smallAction(String label, VoidCallback? onTap) => TextButton(
        onPressed: onTap,
        style: TextButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          minimumSize: const Size(0, 32),
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        ),
        child: Text(label, style: const TextStyle(fontSize: 12.5, color: teal, fontWeight: FontWeight.w600)),
      );

  Widget _muted(String text) => Text(text, style: TextStyle(fontSize: 13, color: Colors.grey.shade400));

  Widget _infoLine(IconData icon, String text) => Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, size: 16, color: Colors.grey.shade500),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 13, color: Color(0xFF333333)))),
        ]),
      );

  static const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  String _dayMonth(DateTime d) => '${d.day} ${_months[d.month - 1]}';
  String _fullDate(DateTime d) => '${d.day} ${_months[d.month - 1]} ${d.year}';

  Widget _infoBody(Doctor d) {
    final lines = <Widget>[
      if (d.phone?.isNotEmpty == true) _infoLine(Icons.phone_outlined, d.phone!),
      if (d.email?.isNotEmpty == true) _infoLine(Icons.mail_outline, d.email!),
      if (d.clinicName?.isNotEmpty == true) _infoLine(Icons.local_hospital_outlined, d.clinicName!),
      if (d.clinicAddress?.isNotEmpty == true) _infoLine(Icons.location_on_outlined, d.clinicAddress!),
      if (d.dob != null) _infoLine(Icons.cake_outlined, 'Birthday ${_dayMonth(d.dob!)}'),
      if (d.anniversary != null) _infoLine(Icons.celebration_outlined, 'Anniversary ${_dayMonth(d.anniversary!)}'),
    ];
    return lines.isEmpty
        ? Padding(padding: const EdgeInsets.only(top: 4), child: _muted('No details yet. Tap the pencil to add them.'))
        : Column(crossAxisAlignment: CrossAxisAlignment.start, children: lines);
  }

  Widget _lastMeetingBody() {
    if (_editingMeeting) {
      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        GestureDetector(
          onTap: _pickDraftDate,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(border: Border.all(color: Colors.grey.shade300), borderRadius: BorderRadius.circular(8)),
            child: Row(children: [
              Icon(Icons.calendar_today, size: 15, color: Colors.grey.shade600),
              const SizedBox(width: 8),
              Text(_draftDate != null ? _fullDate(_draftDate!) : 'Select date', style: const TextStyle(fontSize: 13.5)),
            ]),
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
        const SizedBox(height: 6),
        Row(children: [
          _smallAction(_savingMeeting ? 'Saving...' : 'Save', _savingMeeting ? null : _saveMeeting),
          TextButton(
            onPressed: () => setState(() => _editingMeeting = false),
            child: Text('Cancel', style: TextStyle(fontSize: 12.5, color: Colors.grey.shade500)),
          ),
        ]),
      ]);
    }
    if (_lastMeetingAt == null) return _muted('No meeting recorded yet');
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(_fullDate(_lastMeetingAt!), style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500)),
      if (_lastMeetingNotes != null && _lastMeetingNotes!.isNotEmpty) ...[
        const SizedBox(height: 4),
        Text(_lastMeetingNotes!, style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
      ],
    ]);
  }

  Widget _meetingsBody(Doctor d) {
    if (_loadingMeetings) return _spinner();
    if (_meetings.isEmpty) return _muted('No meetings booked yet');
    return Column(
      children: _meetings.map((m) {
        final statusColor = m.status == 'completed'
            ? Colors.green
            : m.status == 'cancelled'
                ? Colors.grey
                : teal;
        final t = m.scheduledAt;
        return InkWell(
          onTap: () => context.push('/meetings?doctor_id=${d.id}'),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${_fullDate(t)} · ${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}',
                      style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500)),
                  if (m.notes != null && m.notes!.isNotEmpty)
                    Text(m.notes!, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                ]),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: statusColor.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(20)),
                child: Text(m.status, style: TextStyle(fontSize: 10.5, color: statusColor, fontWeight: FontWeight.w600)),
              ),
            ]),
          ),
        );
      }).toList(),
    );
  }

  Widget _presentationsBody() {
    if (_loadingPresentations) return _spinner();
    if (_presentations.isEmpty) return _muted('No presentations linked yet');
    return Column(
      children: _presentations.map((p) {
        return InkWell(
          onTap: () => context.push('/presentations/${p.id}'),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Flexible(
                      child: Text(p.name,
                          style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500), overflow: TextOverflow.ellipsis),
                    ),
                    if (p.isDefaultForDoctor) ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(color: Colors.grey.shade100, borderRadius: BorderRadius.circular(20)),
                        child: Text('Auto', style: TextStyle(fontSize: 9.5, color: Colors.grey.shade600, fontWeight: FontWeight.w600)),
                      ),
                    ],
                  ]),
                  Text('${p.slideCount} slide${p.slideCount != 1 ? 's' : ''}',
                      style: TextStyle(fontSize: 11.5, color: Colors.grey.shade400)),
                ]),
              ),
              IconButton(
                icon: const Icon(Icons.play_circle_outline, color: teal),
                tooltip: 'Present',
                onPressed: () => _play(p),
              ),
              PresentationDownloadButton(presentationId: p.id, name: p.name),
            ]),
          ),
        );
      }).toList(),
    );
  }

  Widget _productsBody(Doctor d) {
    if (_loading) return _spinner();
    if (_assigned.isEmpty) return _muted('No products assigned yet');
    return Column(
      children: _assigned.map((p) {
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: p.imageUrl != null
                  ? CachedNetworkImage(
                      imageUrl: p.imageUrl!,
                      width: 40,
                      height: 40,
                      fit: BoxFit.cover,
                      errorWidget: (_, __, ___) => _productPlaceholder(),
                    )
                  : _productPlaceholder(),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: InkWell(
                onTap: () => context.push('/products/${p.productId}'),
                child: Text(p.productName,
                    style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13.5, color: Color(0xFF1A1A1A))),
              ),
            ),
            _removingId == p.productId
                ? const Padding(
                    padding: EdgeInsets.all(10),
                    child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.red)),
                  )
                : IconButton(
                    icon: Icon(Icons.close, color: Colors.grey.shade500, size: 18),
                    tooltip: 'Remove',
                    onPressed: () async {
                      final confirm = await showDialog<bool>(
                        context: context,
                        builder: (dialogContext) => AlertDialog(
                          title: const Text('Remove product?'),
                          content: Text('Remove "${p.productName}" from Dr. ${d.name}?'),
                          actions: [
                            TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
                            TextButton(
                                onPressed: () => Navigator.pop(dialogContext, true),
                                child: const Text('Remove', style: TextStyle(color: Colors.red))),
                          ],
                        ),
                      );
                      if (confirm == true) _removeProduct(p.productId);
                    },
                  ),
          ]),
        );
      }).toList(),
    );
  }

  Widget _spinner() => const Center(
      child: Padding(
          padding: EdgeInsets.symmetric(vertical: 8),
          child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: teal))));

  @override
  Widget build(BuildContext context) {
    final d = _doctor;
    final subtitle = d.speciality?.isNotEmpty == true ? d.speciality! : null;

    return Scaffold(
      backgroundColor: const Color(0xFFF6F8F8),
      appBar: AppBar(
        leading: const ShellBack(),
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: Colors.black,
        title: Text(d.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
        actions: [
          IconButton(
            icon: const Icon(Icons.edit_outlined, color: teal, size: 20),
            tooltip: 'Edit profile',
            onPressed: _showEditSheet,
          ),
          IconButton(
            icon: const Icon(Icons.calendar_today_outlined, color: teal, size: 20),
            tooltip: 'Schedule meeting',
            onPressed: () => context.push('/meetings?doctor_id=${d.id}'),
          ),
          if (ref.watch(authProvider).user?.role != 'team_member')
            PopupMenuButton<String>(
              icon: const Icon(Icons.more_vert, color: Colors.black54),
              onSelected: (v) {
                if (v == 'delete') _deleteDoctor();
              },
              itemBuilder: (_) => const [
                PopupMenuItem(
                  value: 'delete',
                  child: Row(children: [
                    Icon(Icons.delete_outline, color: Colors.red, size: 20),
                    SizedBox(width: 10),
                    Text('Delete doctor', style: TextStyle(color: Colors.red)),
                  ]),
                ),
              ],
            ),
        ],
      ),
      body: ResponsiveCenter(
        child: RefreshIndicator(
          color: teal,
          onRefresh: () => Future.wait([_loadProducts(), _loadMeetings(), _loadPresentations()]),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              _section(
                id: 'info',
                title: subtitle == null ? 'Details' : 'Details · $subtitle',
                child: _infoBody(d),
              ),
              _section(
                id: 'last',
                title: 'Last meeting',
                action: _editingMeeting ? null : _smallAction(_lastMeetingAt != null ? 'Edit' : '+ Add', _startEditMeeting),
                child: _lastMeetingBody(),
              ),
              _section(
                id: 'meetings',
                title: 'Meetings',
                count: _meetings.length,
                action: _smallAction('+ Schedule', () => context.push('/meetings?doctor_id=${d.id}')),
                child: _meetingsBody(d),
              ),
              _section(
                id: 'presentations',
                title: 'Presentations',
                count: _presentations.length,
                action: _smallAction(
                    _generatingPresentation ? 'Generating...' : '+ Generate', _generatingPresentation ? null : _generatePresentation),
                child: _presentationsBody(),
              ),
              _section(
                id: 'products',
                title: 'Assigned products',
                count: _assigned.length,
                action: _smallAction('+ Assign', _showAddProductSheet),
                child: _productsBody(d),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _productPlaceholder() => Container(
        width: 40, height: 40,
        color: Colors.grey.shade100,
        child: const Icon(Icons.medication_outlined, color: Colors.grey, size: 22),
      );
}

// ── Bottom sheet to pick and assign products ───────────────────────────────
// Tick any number of products (the ticks survive searching), then assign
// them all at once with the button at the bottom.
class _AddProductSheet extends StatefulWidget {
  final String doctorId;
  final Set<String> alreadyAssigned;
  final void Function(List<Product>) onAdded;

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
  final Map<String, Product> _selected = {};
  bool _assigning = false;

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

  void _toggle(Product p) {
    if (_assigning) return;
    setState(() => _selected.containsKey(p.id) ? _selected.remove(p.id) : _selected[p.id] = p);
  }

  // Assigns every ticked product (in parallel, one call each). Ones that
  // fail stay ticked so they can be retried; the sheet closes when all went.
  Future<void> _assignSelected() async {
    if (_assigning || _selected.isEmpty) return;
    setState(() => _assigning = true);
    final picked = _selected.values.toList();
    final failed = <Product>[];
    await Future.wait(picked.map((p) async {
      try {
        await _doctorService.addDoctorProduct(widget.doctorId, p.id);
      } catch (_) {
        failed.add(p);
      }
    }));
    final done = picked.where((p) => !failed.contains(p)).toList();
    if (done.isNotEmpty) widget.onAdded(done);
    if (!mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    if (failed.isEmpty) {
      Navigator.pop(context);
      messenger.showSnackBar(SnackBar(
        content: Text(done.length == 1 ? '${done.first.name} assigned' : '${done.length} products assigned'),
        backgroundColor: const Color(0xFF00A6A4),
        behavior: SnackBarBehavior.floating,
      ));
      return;
    }
    setState(() {
      _assigning = false;
      for (final p in done) {
        _selected.remove(p.id);
        widget.alreadyAssigned.add(p.id);
      }
    });
    messenger.showSnackBar(SnackBar(
      content: Text('${done.length} assigned, ${failed.length} could not be. They are still ticked; try again.'),
      backgroundColor: Colors.red,
      behavior: SnackBarBehavior.floating,
    ));
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
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(
              children: [
                const Expanded(
                  child: Text('Assign Products', style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
                ),
                if (_selected.isNotEmpty)
                  TextButton(
                    onPressed: _assigning ? null : () => setState(_selected.clear),
                    child: Text('Clear (${_selected.length})', style: const TextStyle(color: Colors.grey, fontSize: 13)),
                  ),
              ],
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
                          final ticked = _selected.containsKey(p.id);
                          return ListTile(
                            onTap: () => _toggle(p),
                            selected: ticked,
                            selectedTileColor: const Color(0xFF00A6A4).withAlpha(18),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                            leading: ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: p.cardImageUrl != null
                                  ? CachedNetworkImage(imageUrl: p.cardImageUrl!, width: 44, height: 44, fit: BoxFit.cover, errorWidget: (_, __, ___) => Container(width: 44, height: 44, color: Colors.grey.shade100, child: const Icon(Icons.medication_outlined, color: Colors.grey)))
                                  : Container(width: 44, height: 44, color: Colors.grey.shade100, child: const Icon(Icons.medication_outlined, color: Colors.grey)),
                            ),
                            title: Text(p.name, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                            subtitle: p.categories.isNotEmpty ? Text(p.categories.first, style: const TextStyle(fontSize: 12, color: Color(0xFF00A6A4))) : null,
                            trailing: Checkbox(
                              value: ticked,
                              activeColor: const Color(0xFF00A6A4),
                              onChanged: _assigning ? null : (_) => _toggle(p),
                            ),
                          );
                        },
                      ),
          ),
          if (_selected.isNotEmpty)
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton(
                    onPressed: _assigning ? null : _assignSelected,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF00A6A4),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      elevation: 0,
                    ),
                    child: _assigning
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : Text('Assign ${_selected.length} product${_selected.length == 1 ? '' : 's'}',
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
