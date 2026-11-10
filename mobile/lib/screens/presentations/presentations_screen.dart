import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../models/doctor.dart';
import '../../models/presentation.dart';
import '../../services/doctor_service.dart';
import '../../services/presentation_downloads.dart';
import '../../services/presentation_service.dart';
import 'present.dart';
import '../../widgets/presentation_download_button.dart';
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
  // Decks saved on this phone (services/presentation_downloads.dart). With
  // no internet the list shows just these, and they open straight in the
  // viewer.
  Map<String, DownloadedPresentation> _downloads = {};
  bool _offline = false;
  bool _downloadedOnly = false; // the "Downloaded" filter
  final _service = PresentationService();
  final _doctorService = DoctorService();

  @override
  void initState() {
    super.initState();
    PresentationDownloads.changes.addListener(_downloadsChanged);
    _load();
    _doctorService.getDoctors().then((d) {
      if (mounted) setState(() => _doctors = d);
    }).catchError((_) {});
  }

  @override
  void dispose() {
    PresentationDownloads.changes.removeListener(_downloadsChanged);
    super.dispose();
  }

  // A deck was downloaded or removed (here or on another screen).
  Future<void> _downloadsChanged() async {
    final downloads = {for (final d in await PresentationDownloads.list()) d.id: d};
    if (!mounted) return;
    setState(() {
      _downloads = downloads;
      if (_offline) _presentations = downloads.values.map((d) => d.asPresentation).toList();
    });
  }

  Future<void> _load() async {
    final downloads = {for (final d in await PresentationDownloads.list()) d.id: d};
    try {
      final list = await _service.getPresentations();
      if (!mounted) return;
      setState(() {
        _presentations = list;
        _downloads = downloads;
        _offline = false;
        _loading = false;
      });
    } catch (_) {
      // No connection (or the server is down): show what's downloaded.
      if (!mounted) return;
      setState(() {
        _downloads = downloads;
        _presentations = downloads.values.map((d) => d.asPresentation).toList();
        _offline = true;
        _loading = false;
      });
    }
  }

  void _snack(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  Future<void> _presentDownloaded(Presentation p) async {
    final d = _downloads[p.id];
    if (d == null) return;
    if (!await PresentationDownloads.isComplete(d)) {
      _snack(_offline
          ? 'Some slides of "${p.name}" are no longer on this phone. Download it again when online.'
          : 'Some slides are missing on this phone; they will load from the internet.');
      if (_offline) return;
    }
    final notebook = await notebookPreferred();
    if (mounted) presentSlides(context, d.slides, notebook: notebook);
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
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Delete', style: TextStyle(color: Colors.red))),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await _service.deletePresentation(p.id);
      if (_downloads.containsKey(p.id)) await PresentationDownloads.remove(p.id);
      setState(() {
        _presentations?.removeWhere((x) => x.id == p.id);
        _downloads.remove(p.id);
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not delete: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  // The cards shown: all of them, or only the downloaded ones.
  List<Presentation> get _visible => _downloadedOnly && !_offline
      ? _presentations!.where((p) => _downloads.containsKey(p.id)).toList()
      : _presentations!;

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
          if (!_offline)
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
                        Text(
                          _offline ? 'No internet, and no presentations downloaded' : 'No presentations yet',
                          style: const TextStyle(color: Colors.grey, fontSize: 16),
                          textAlign: TextAlign.center,
                        ),
                        if (_offline) ...[
                          const SizedBox(height: 6),
                          Text('Tap the download button on a presentation while online to keep it on this phone.',
                              style: TextStyle(color: Colors.grey.shade500, fontSize: 12), textAlign: TextAlign.center),
                        ],
                        const SizedBox(height: 12),
                        if (!_offline)
                          TextButton.icon(
                            icon: const Icon(Icons.add, color: Color(0xFF00A6A4)),
                            label: const Text('Build your first slideshow', style: TextStyle(color: Color(0xFF00A6A4))),
                            onPressed: _createPresentation,
                          ),
                        if (_offline)
                          TextButton.icon(
                            icon: const Icon(Icons.refresh, color: Color(0xFF00A6A4)),
                            label: const Text('Try again', style: TextStyle(color: Color(0xFF00A6A4))),
                            onPressed: _load,
                          ),
                      ],
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: _load,
                    color: const Color(0xFF00A6A4),
                    child: CustomScrollView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      slivers: [
                        if (!_offline)
                          SliverToBoxAdapter(
                            child: Padding(
                              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                              child: Wrap(
                                spacing: 8,
                                children: [
                                  ChoiceChip(
                                    label: const Text('All'),
                                    selected: !_downloadedOnly,
                                    selectedColor: const Color(0xFF00A6A4).withAlpha(40),
                                    onSelected: (_) => setState(() => _downloadedOnly = false),
                                  ),
                                  ChoiceChip(
                                    avatar: const Icon(Icons.download_done, size: 16, color: Color(0xFF00A6A4)),
                                    label: Text(
                                        'Downloaded (${_presentations!.where((p) => _downloads.containsKey(p.id)).length})'),
                                    selected: _downloadedOnly,
                                    selectedColor: const Color(0xFF00A6A4).withAlpha(40),
                                    onSelected: (_) => setState(() => _downloadedOnly = true),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        if (!_offline && _downloadedOnly && !_presentations!.any((p) => _downloads.containsKey(p.id)))
                          SliverToBoxAdapter(
                            child: Padding(
                              padding: const EdgeInsets.fromLTRB(24, 40, 24, 0),
                              child: Text(
                                'No presentations have been downloaded yet. Tap the download button on a presentation to keep it on this phone.',
                                textAlign: TextAlign.center,
                                style: TextStyle(color: Colors.grey.shade500, fontSize: 13),
                              ),
                            ),
                          ),
                        if (_offline)
                          SliverToBoxAdapter(
                            child: Container(
                              margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              decoration:
                                  BoxDecoration(color: Colors.orange.shade50, borderRadius: BorderRadius.circular(10)),
                              child: Row(
                                children: [
                                  Icon(Icons.cloud_off, size: 16, color: Colors.orange.shade700),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text('Offline: showing downloaded presentations. Pull down to retry.',
                                        style: TextStyle(fontSize: 12, color: Colors.orange.shade700)),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        SliverPadding(
                          padding: const EdgeInsets.all(16),
                          sliver: SliverGrid.builder(
                            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: 2,
                              crossAxisSpacing: 12,
                              mainAxisSpacing: 12,
                              childAspectRatio: 0.82,
                            ),
                            itemCount: _visible.length,
                            itemBuilder: (ctx, i) {
                              final p = _visible[i];
                              return GestureDetector(
                                // Offline the builder can't load, so a downloaded deck opens straight in the viewer.
                                onTap: () => _offline
                                    ? _presentDownloaded(p)
                                    : context.push('/presentations/${p.id}').then((_) => _load()),
                                onLongPress: _offline ? null : () => _deletePresentation(p),
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
                                        child: Stack(
                                          children: [
                                            Positioned.fill(
                                              child: p.previewUrls.isEmpty
                                                  ? Container(
                                                      width: double.infinity,
                                                      color: Colors.grey.shade50,
                                                      child: Icon(Icons.slideshow_outlined,
                                                          color: Colors.grey.shade300, size: 40),
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
                                                          child: CachedNetworkImage(
                                                            imageUrl: url,
                                                            cacheManager: PresentationDownloads.cache,
                                                            fit: BoxFit.contain,
                                                            errorWidget: (_, __, ___) => Icon(
                                                                Icons.image_not_supported_outlined,
                                                                color: Colors.grey.shade300),
                                                          ),
                                                        );
                                                      }).toList(),
                                                    ),
                                            ),
                                            Positioned(
                                              top: 6,
                                              right: 6,
                                              child: PresentationDownloadButton(
                                                presentationId: p.id,
                                                name: p.name,
                                                overlay: true,
                                                offline: _offline,
                                              ),
                                            ),
                                          ],
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
                                                  child: Text(p.name,
                                                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                                                      maxLines: 1,
                                                      overflow: TextOverflow.ellipsis),
                                                ),
                                                if (p.isDefaultForDoctor) ...[
                                                  const SizedBox(width: 4),
                                                  Container(
                                                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                                                    decoration: BoxDecoration(
                                                        color: Colors.grey.shade100,
                                                        borderRadius: BorderRadius.circular(20)),
                                                    child: Text('Auto',
                                                        style: TextStyle(
                                                            fontSize: 8.5,
                                                            color: Colors.grey.shade600,
                                                            fontWeight: FontWeight.w600)),
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
                      ],
                    ),
                  ),
      ),
    );
  }
}
