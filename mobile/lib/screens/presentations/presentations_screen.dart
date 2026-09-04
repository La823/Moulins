import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../models/doctor.dart';
import '../../models/presentation.dart';
import '../../services/doctor_service.dart';
import '../../services/presentation_service.dart';
import '../../widgets/notification_bell_button.dart';
import '../../widgets/chat_button.dart';
import '../../widgets/profile_button.dart';
import '../../utils/responsive.dart';
import '../../widgets/app_drawer.dart';

class PresentationsScreen extends StatefulWidget {
  const PresentationsScreen({super.key});

  @override
  State<PresentationsScreen> createState() => _PresentationsScreenState();
}

class _PresentationsScreenState extends State<PresentationsScreen> {
  List<Presentation>? _presentations;
  List<Doctor> _doctors = [];
  bool _loading = true;
  final _service = PresentationService();
  final _doctorService = DoctorService();

  @override
  void initState() {
    super.initState();
    _load();
    _doctorService.getDoctors().then((d) {
      if (mounted) setState(() => _doctors = d);
    }).catchError((_) {});
  }

  Future<void> _load() async {
    try {
      final list = await _service.getPresentations();
      setState(() {
        _presentations = list;
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  Future<void> _createPresentation() async {
    final nameCtrl = TextEditingController();
    String? doctorId;
    final result = await showModalBottomSheet<Map<String, String?>>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (sheetCtx) => StatefulBuilder(
        builder: (sheetCtx, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(sheetCtx).viewInsets.bottom + 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('New Presentation', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 16),
              TextField(
                controller: nameCtrl,
                autofocus: true,
                decoration: InputDecoration(
                  labelText: 'Presentation Name',
                  filled: true,
                  fillColor: Colors.grey.shade50,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String?>(
                initialValue: doctorId,
                decoration: InputDecoration(
                  labelText: 'Doctor (optional)',
                  filled: true,
                  fillColor: Colors.grey.shade50,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
                ),
                items: [
                  const DropdownMenuItem<String?>(value: null, child: Text('Not linked to a doctor')),
                  ..._doctors.map((d) => DropdownMenuItem<String?>(value: d.id, child: Text(d.name))),
                ],
                onChanged: (v) => setSheetState(() => doctorId = v),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  onPressed: () => Navigator.pop(sheetCtx, {'name': nameCtrl.text.trim(), 'doctorId': doctorId}),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF00A6A4),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    elevation: 0,
                  ),
                  child: const Text('Create & Build'),
                ),
              ),
            ],
          ),
        ),
      ),
    );

    final name = result?['name'];
    if (name == null || name.isEmpty || !mounted) return;
    try {
      final id = await _service.createPresentation(name, doctorId: result?['doctorId']);
      if (mounted) context.push('/presentations/$id').then((_) => _load());
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not create presentation: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  Future<void> _deletePresentation(Presentation p) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Presentation'),
        content: Text('Delete "${p.name}"? This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete', style: TextStyle(color: Colors.red))),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await _service.deletePresentation(p.id);
      setState(() => _presentations?.removeWhere((x) => x.id == p.id));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not delete: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      drawer: const AppDrawer(),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('My Presentations', style: TextStyle(color: Color(0xFF1A1A1A), fontWeight: FontWeight.w600)),
        actions: [
          IconButton(icon: const Icon(Icons.add, color: Color(0xFF00A6A4)), onPressed: _createPresentation),
          const ChatButton(),
          const NotificationBellButton(),
          const ProfileButton(),
          const SizedBox(width: 4),
        ],
      ),
      body: ResponsiveCenter(
        child: _loading
            ? const Center(child: CircularProgressIndicator(color: Color(0xFF00A6A4)))
            : _presentations == null || _presentations!.isEmpty
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.slideshow_outlined, size: 64, color: Colors.grey.shade300),
                        const SizedBox(height: 16),
                        const Text('No presentations yet', style: TextStyle(color: Colors.grey, fontSize: 16)),
                        const SizedBox(height: 12),
                        TextButton.icon(
                          icon: const Icon(Icons.add, color: Color(0xFF00A6A4)),
                          label: const Text('Build your first slideshow', style: TextStyle(color: Color(0xFF00A6A4))),
                          onPressed: _createPresentation,
                        ),
                      ],
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: _load,
                    color: const Color(0xFF00A6A4),
                    child: GridView.builder(
                      padding: const EdgeInsets.all(16),
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 2,
                        crossAxisSpacing: 12,
                        mainAxisSpacing: 12,
                        childAspectRatio: 0.82,
                      ),
                      itemCount: _presentations!.length,
                      itemBuilder: (ctx, i) {
                        final p = _presentations![i];
                        return GestureDetector(
                          onTap: () => context.push('/presentations/${p.id}').then((_) => _load()),
                          onLongPress: () => _deletePresentation(p),
                          child: Container(
                            decoration: BoxDecoration(
                              color: Colors.white,
                              border: Border.all(color: Colors.grey.shade200),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            clipBehavior: Clip.antiAlias,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: p.previewUrls.isEmpty
                                      ? Container(
                                          width: double.infinity,
                                          color: Colors.grey.shade50,
                                          child: Icon(Icons.slideshow_outlined, color: Colors.grey.shade300, size: 40),
                                        )
                                      : GridView.count(
                                          crossAxisCount: p.previewUrls.length > 1 ? 2 : 1,
                                          physics: const NeverScrollableScrollPhysics(),
                                          mainAxisSpacing: 1,
                                          crossAxisSpacing: 1,
                                          children: p.previewUrls.take(4).map((url) {
                                            return Container(
                                              color: Colors.grey.shade50,
                                              padding: const EdgeInsets.all(2),
                                              child: Image.network(url, fit: BoxFit.contain),
                                            );
                                          }).toList(),
                                        ),
                                ),
                                Padding(
                                  padding: const EdgeInsets.all(10),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Flexible(
                                            child: Text(p.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13), maxLines: 1, overflow: TextOverflow.ellipsis),
                                          ),
                                          if (p.isDefaultForDoctor) ...[
                                            const SizedBox(width: 4),
                                            Container(
                                              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                                              decoration: BoxDecoration(color: Colors.grey.shade100, borderRadius: BorderRadius.circular(20)),
                                              child: Text('Auto', style: TextStyle(fontSize: 8.5, color: Colors.grey.shade600, fontWeight: FontWeight.w600)),
                                            ),
                                          ],
                                        ],
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        '${p.slideCount} slide${p.slideCount != 1 ? 's' : ''}${p.doctorName != null ? ' · ${p.doctorName}' : ''}',
                                        style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ),
      ),
    );
  }
}
