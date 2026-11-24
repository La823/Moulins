import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../models/doctor.dart';
import '../../providers/auth_provider.dart';
import '../../services/doctor_service.dart';
import '../../services/meeting_service.dart';
import '../../services/presentation_downloads.dart';
import '../../services/presentation_service.dart';
import '../../services/offline_sync.dart';
import '../../widgets/notification_bell_button.dart';
import '../../widgets/chat_button.dart';
import '../../widgets/profile_button.dart';
import 'doctor_detail_screen.dart';
import 'doctor_form_sheet.dart';
import '../../utils/responsive.dart';
import '../../widgets/app_drawer.dart';
import '../../widgets/shell_leading.dart';

class DoctorsScreen extends ConsumerStatefulWidget {
  const DoctorsScreen({super.key});

  @override
  ConsumerState<DoctorsScreen> createState() => _DoctorsScreenState();
}

class _DoctorsScreenState extends ConsumerState<DoctorsScreen> {
  List<Doctor>? _doctors;
  bool _loading = true;
  bool _offline = false; // showing the doctors saved on the phone
  final _service = DoctorService();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final d = await _service.getDoctors();
      setState(() {
        _doctors = d;
        _offline = DoctorService.lastFromCache;
        _loading = false;
      });
      // keep every doctor's page (products, meetings) on the phone too
      // (the products in full and the presentations with Smart sync)
      if (!_offline && OfflineSync.smartNow) {
        _service.saveAllForOffline(d);
        MeetingService().getMeetings().then((_) {}, onError: (_) {});
        // every presentation linked to a doctor stays on the phone
        final ps = PresentationService();
        ps.getPresentations().then((all) {
          PresentationDownloads.keepDownloaded(all.where((p) => p.doctorId != null).toList(), ps.getPresentation);
        }, onError: (_) {});
      }
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  // doctors whose card is opened up with the arrow
  final Set<String> _expanded = {};

  Future<void> _showAddDialog() async {
    final saved = await showDoctorFormSheet(context);
    if (saved != null) _load();
  }

  void _openDoctor(Doctor d) {
    Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => DoctorDetailScreen(doctor: d))).then((deleted) {
      if (!mounted) return;
      if (deleted == true) {
        setState(() => _doctors?.removeWhere((x) => x.id == d.id));
      } else {
        _load(); // pick up edits made on the doctor's page
      }
    });
  }

  String _initials(String name) {
    final parts = name.replaceFirst(RegExp(r'^Dr\.?\s*', caseSensitive: false), '').trim().split(RegExp(r'\s+'));
    final letters = parts.take(2).where((p) => p.isNotEmpty).map((p) => p[0].toUpperCase()).join();
    return letters.isEmpty ? '?' : letters;
  }

  static const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  String _dayMonth(DateTime d) => '${d.day} ${_months[d.month - 1]}';

  Widget _detailLine(IconData icon, String text) => Padding(
        padding: const EdgeInsets.only(top: 6),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, size: 15, color: Colors.grey.shade500),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text,
                maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, color: Color(0xFF333333))),
          ),
        ]),
      );

  Widget _doctorCard(Doctor d) {
    final open = _expanded.contains(d.id);
    final subtitle = [d.speciality, d.clinicName].where((x) => x != null && x.isNotEmpty).join(' · ');
    final lines = <Widget>[
      if (d.phone?.isNotEmpty == true) _detailLine(Icons.phone_outlined, d.phone!),
      if (d.email?.isNotEmpty == true) _detailLine(Icons.mail_outline, d.email!),
      if (d.clinicAddress?.isNotEmpty == true) _detailLine(Icons.location_on_outlined, d.clinicAddress!),
      if (d.dob != null) _detailLine(Icons.cake_outlined, 'Birthday ${_dayMonth(d.dob!)}'),
      if (d.anniversary != null) _detailLine(Icons.celebration_outlined, 'Anniversary ${_dayMonth(d.anniversary!)}'),
      _detailLine(Icons.medication_outlined, '${d.productCount} product${d.productCount == 1 ? '' : 's'} assigned'),
    ];
    return Material(
      color: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: Colors.grey.shade200)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => _openDoctor(d),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              CircleAvatar(
                radius: 18,
                backgroundColor: const Color(0xFFE8F8F8),
                child: Text(_initials(d.name),
                    style: const TextStyle(color: Color(0xFF00A6A4), fontWeight: FontWeight.w700, fontSize: 12.5)),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(d.name,
                      maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                  if (subtitle.isNotEmpty)
                    Text(subtitle,
                        maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                ]),
              ),
              IconButton(
                visualDensity: VisualDensity.compact,
                tooltip: open ? 'Show less' : 'Show more',
                icon: AnimatedRotation(
                  turns: open ? 0.5 : 0,
                  duration: const Duration(milliseconds: 200),
                  child: Icon(Icons.keyboard_arrow_down, color: Colors.grey.shade600),
                ),
                onPressed: () => setState(() => open ? _expanded.remove(d.id) : _expanded.add(d.id)),
              ),
            ]),
            AnimatedSize(
              duration: const Duration(milliseconds: 200),
              curve: Curves.easeOut,
              alignment: Alignment.topCenter,
              child: open
                  ? Padding(
                      padding: const EdgeInsets.only(left: 46, right: 8, bottom: 4),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: lines),
                    )
                  : const SizedBox(width: double.infinity),
            ),
          ]),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8F8),
      drawer: const AppDrawer(),
      appBar: AppBar(
        leadingWidth: ShellLeading.widthFor(context),
        leading: const ShellLeading(),
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('My Doctors',
            style: TextStyle(
                color: Color(0xFF1A1A1A), fontWeight: FontWeight.w600)),
        actions: [
          IconButton(
            icon: const Icon(Icons.calendar_today_outlined,
                color: Color(0xFF00A6A4), size: 20),
            tooltip: 'My Meetings',
            onPressed: () => context.push('/meetings'),
          ),
          if (ref.watch(authProvider).user?.canAddDoctors ?? true)
            IconButton(
              icon: const Icon(Icons.add, color: Color(0xFF00A6A4)),
              onPressed: _showAddDialog,
            ),
          const ChatButton(),
          const NotificationBellButton(),
          const ProfileButton(),
          const SizedBox(width: 4),
        ],
        bottom: _offline
            ? PreferredSize(
                preferredSize: const Size.fromHeight(32),
                child: Container(
                  height: 32,
                  color: Colors.orange.shade50,
                  alignment: Alignment.center,
                  child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                    Icon(Icons.cloud_off, size: 14, color: Colors.orange.shade700),
                    const SizedBox(width: 6),
                    Text('Offline: showing doctors saved on this phone. Pull down to retry.',
                        style: TextStyle(fontSize: 12, color: Colors.orange.shade700)),
                  ]),
                ),
              )
            : null,
      ),
      body: ResponsiveCenter(
        child: _loading
            ? const Center(
                child: CircularProgressIndicator(color: Color(0xFF00A6A4)))
            : _doctors == null || _doctors!.isEmpty
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.person_outlined,
                            size: 64, color: Colors.grey.shade300),
                        const SizedBox(height: 16),
                        const Text('No doctors added yet',
                            style: TextStyle(color: Colors.grey, fontSize: 16)),
                        const SizedBox(height: 12),
                        if (ref.watch(authProvider).user?.canAddDoctors ?? true)
                          TextButton.icon(
                            icon: const Icon(Icons.add, color: Color(0xFF00A6A4)),
                            label: const Text('Add Doctor',
                                style: TextStyle(color: Color(0xFF00A6A4))),
                            onPressed: _showAddDialog,
                          ),
                      ],
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: _load,
                    color: const Color(0xFF00A6A4),
                    child: ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                      itemCount: _doctors!.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (ctx, i) => _doctorCard(_doctors![i]),
                    ),
                  ),
      ),
    );
  }
}
