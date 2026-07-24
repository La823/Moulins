import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_contacts/flutter_contacts.dart';
import '../../models/doctor.dart';
import '../../services/doctor_service.dart';
import '../../widgets/notification_bell_button.dart';
import '../../widgets/chat_button.dart';
import '../../widgets/profile_button.dart';
import '../../widgets/location_picker_screen.dart';
import 'doctor_detail_screen.dart';
import '../../utils/responsive.dart';
import '../../widgets/app_drawer.dart';

class DoctorsScreen extends StatefulWidget {
  const DoctorsScreen({super.key});

  @override
  State<DoctorsScreen> createState() => _DoctorsScreenState();
}

class _DoctorsScreenState extends State<DoctorsScreen> {
  List<Doctor>? _doctors;
  bool _loading = true;
  final _service = DoctorService();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final d = await _service.getDoctors();
      setState(() { _doctors = d; _loading = false; });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  void _showAddDialog() {
    final nameCtrl = TextEditingController();
    final phoneCtrl = TextEditingController();
    final clinicCtrl = TextEditingController();
    DateTime? dob;
    PickedLocation? location;

    showModalBottomSheet(
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
              const Text('Add Doctor', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 20),
              _field(nameCtrl, 'Doctor Name *'),
              const SizedBox(height: 12),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: _field(phoneCtrl, 'Phone', type: TextInputType.phone)),
                  const SizedBox(width: 8),
                  Container(
                    height: 48,
                    width: 48,
                    decoration: BoxDecoration(
                      color: Colors.grey.shade50,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: Colors.grey.shade200),
                    ),
                    child: IconButton(
                      icon: const Icon(Icons.contacts_outlined, color: Color(0xFF00A6A4)),
                      tooltip: 'Pick from contacts',
                      onPressed: () async {
                        try {
                          final contact = await FlutterContacts.openExternalPick();
                          if (contact == null) return;
                          if (contact.phones.isNotEmpty) {
                            phoneCtrl.text = contact.phones.first.number;
                          }
                          if (nameCtrl.text.trim().isEmpty && contact.displayName.isNotEmpty) {
                            nameCtrl.text = contact.displayName;
                          }
                        } catch (_) {
                          if (sheetCtx.mounted) {
                            ScaffoldMessenger.of(sheetCtx).showSnackBar(
                              const SnackBar(content: Text('Could not open contacts')),
                            );
                          }
                        }
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              _field(clinicCtrl, 'Clinic Name'),
              const SizedBox(height: 12),
              InkWell(
                onTap: () async {
                  final picked = await Navigator.push<PickedLocation>(
                    sheetCtx,
                    MaterialPageRoute(builder: (_) => LocationPickerScreen(initial: location)),
                  );
                  if (picked != null) setSheetState(() => location = picked);
                },
                child: InputDecorator(
                  decoration: InputDecoration(
                    labelText: 'Clinic Location',
                    filled: true,
                    fillColor: Colors.grey.shade50,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
                    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
                  ),
                  child: Text(
                    location == null
                        ? 'Set location on map...'
                        : (location!.address ?? '${location!.lat.toStringAsFixed(5)}, ${location!.lng.toStringAsFixed(5)}'),
                    style: TextStyle(fontSize: 14, color: location == null ? Colors.grey.shade400 : Colors.black87),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              InkWell(
                onTap: () async {
                  final picked = await showDatePicker(
                    context: sheetCtx,
                    initialDate: DateTime(1985, 1, 1),
                    firstDate: DateTime(1930),
                    lastDate: DateTime.now(),
                  );
                  if (picked != null) setSheetState(() => dob = picked);
                },
                child: InputDecorator(
                  decoration: InputDecoration(
                    labelText: 'Date of Birth',
                    filled: true,
                    fillColor: Colors.grey.shade50,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
                    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
                  ),
                  child: Text(
                    dob == null ? 'Select date' : '${dob!.day}/${dob!.month}/${dob!.year}',
                    style: TextStyle(fontSize: 14, color: dob == null ? Colors.grey.shade400 : Colors.black87),
                  ),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Adds a yearly birthday reminder to your meetings calendar, with daily notifications in the 10 days before.',
                style: TextStyle(fontSize: 11, color: Colors.grey.shade400),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  onPressed: () async {
                    if (nameCtrl.text.trim().isEmpty) return;
                    Navigator.pop(sheetCtx);
                    await _service.createDoctor(
                      name: nameCtrl.text.trim(),
                      phone: phoneCtrl.text.trim().isEmpty ? null : phoneCtrl.text.trim(),
                      clinicName: clinicCtrl.text.trim().isEmpty ? null : clinicCtrl.text.trim(),
                      clinicAddress: location?.address,
                      latitude: location?.lat,
                      longitude: location?.lng,
                      dob: dob,
                    );
                    _load();
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF00A6A4),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    elevation: 0,
                  ),
                  child: const Text('Add Doctor'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _field(TextEditingController ctrl, String label, {TextInputType type = TextInputType.text}) =>
      TextField(
        controller: ctrl,
        keyboardType: type,
        decoration: InputDecoration(
          labelText: label,
          filled: true,
          fillColor: Colors.grey.shade50,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFF00A6A4))),
        ),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      drawer: const AppDrawer(),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('My Doctors', style: TextStyle(color: Color(0xFF1A1A1A), fontWeight: FontWeight.w600)),
        actions: [
          IconButton(
            icon: const Icon(Icons.calendar_today_outlined, color: Color(0xFF00A6A4), size: 20),
            tooltip: 'My Meetings',
            onPressed: () => context.push('/meetings'),
          ),
          IconButton(
            icon: const Icon(Icons.add, color: Color(0xFF00A6A4)),
            onPressed: _showAddDialog,
          ),
          const ChatButton(),
          const NotificationBellButton(),
          const ProfileButton(),
          const SizedBox(width: 4),
        ],
      ),
      body: ResponsiveCenter(child: _loading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF00A6A4)))
          : _doctors == null || _doctors!.isEmpty
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.person_outlined, size: 64, color: Colors.grey.shade300),
                      const SizedBox(height: 16),
                      const Text('No doctors added yet', style: TextStyle(color: Colors.grey, fontSize: 16)),
                      const SizedBox(height: 12),
                      TextButton.icon(
                        icon: const Icon(Icons.add, color: Color(0xFF00A6A4)),
                        label: const Text('Add Doctor', style: TextStyle(color: Color(0xFF00A6A4))),
                        onPressed: _showAddDialog,
                      ),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  color: const Color(0xFF00A6A4),
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: _doctors!.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (ctx, i) {
                      final d = _doctors![i];
                      return GestureDetector(
                        onTap: () => Navigator.push(ctx, MaterialPageRoute(builder: (_) => DoctorDetailScreen(doctor: d))),
                        child: Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          border: Border.all(color: Colors.grey.shade200),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 44, height: 44,
                              decoration: const BoxDecoration(color: Color(0xFFE8F8F8), shape: BoxShape.circle),
                              child: const Icon(Icons.person_outlined, color: Color(0xFF00A6A4)),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(d.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                                  if (d.clinicName != null) Text(d.clinicName!, style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                                  if (d.phone != null) Text(d.phone!, style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                                  if (d.dob != null) Text('🎂 ${d.dob!.day}/${d.dob!.month}', style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                                  if (d.clinicAddress != null)
                                    Text('📍 ${d.clinicAddress}', style: TextStyle(fontSize: 12, color: Colors.grey.shade500), maxLines: 1, overflow: TextOverflow.ellipsis),
                                  if (d.lastMeetingAt != null)
                                    Text(
                                      'Last met ${d.lastMeetingAt!.day}/${d.lastMeetingAt!.month}/${d.lastMeetingAt!.year}',
                                      style: TextStyle(fontSize: 11.5, color: Colors.grey.shade400),
                                    ),
                                ],
                              ),
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete_outline, color: Colors.red, size: 20),
                              onPressed: () async {
                                await _service.deleteDoctor(d.id);
                                _load();
                              },
                            ),
                          ],
                        ),
                      ));
                    },
                  ),
                ),
      ),
    );
  }
}
