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

  Future<void> _deleteDoctor(Doctor d) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete doctor?'),
        content: Text('"${d.name}" will be removed from your doctors list.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete', style: TextStyle(color: Colors.red))),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await _service.deleteDoctor(d.id);
      _load();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not delete doctor')),
        );
      }
    }
  }

  void _showAddDialog() => _showDoctorForm();

  void _showDoctorForm({Doctor? existing}) {
    final nameCtrl = TextEditingController(text: existing?.name ?? '');
    final phoneCtrl = TextEditingController(text: existing?.phone ?? '');
    final emailCtrl = TextEditingController(text: existing?.email ?? '');
    final specialityCtrl = TextEditingController(text: existing?.speciality ?? '');
    final clinicCtrl = TextEditingController(text: existing?.clinicName ?? '');
    DateTime? dob = existing?.dob;
    PickedLocation? location = existing != null && existing.latitude != null && existing.longitude != null
        ? PickedLocation(lat: existing.latitude!, lng: existing.longitude!, address: existing.clinicAddress)
        : null;
    bool submitting = false;
    String? submitError;

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
              Text(existing == null ? 'Add Doctor' : 'Edit Doctor', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
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
                          // Reading a picked contact's phone number needs
                          // READ_CONTACTS — request it up front so a denial
                          // surfaces as a clean message instead of a native
                          // crash when the plugin tries to read the contact.
                          // readonly: true — we only read a picked contact's
                          // number, never write. Requesting WRITE_CONTACTS
                          // too (the default) would fail permanently since
                          // that permission isn't declared in the manifest.
                          final granted = await FlutterContacts.requestPermission(readonly: true);
                          if (!granted) {
                            if (sheetCtx.mounted) {
                              ScaffoldMessenger.of(sheetCtx).showSnackBar(
                                const SnackBar(content: Text('Contacts permission is required to pick a number')),
                              );
                            }
                            return;
                          }
                          final contact = await FlutterContacts.openExternalPick();
                          if (contact == null) return;
                          if (contact.phones.isNotEmpty) {
                            phoneCtrl.text = contact.phones.first.number;
                          }
                          if (contact.emails.isNotEmpty) {
                            emailCtrl.text = contact.emails.first.address;
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
              _field(emailCtrl, 'Email', type: TextInputType.emailAddress),
              const SizedBox(height: 12),
              _field(specialityCtrl, 'Speciality'),
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
              if (submitError != null) ...[
                const SizedBox(height: 8),
                Text(submitError!, style: const TextStyle(color: Colors.red, fontSize: 12.5)),
              ],
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  onPressed: submitting
                      ? null
                      : () async {
                          if (nameCtrl.text.trim().isEmpty) return;
                          setSheetState(() { submitting = true; submitError = null; });
                          try {
                            if (existing == null) {
                              await _service.createDoctor(
                                name: nameCtrl.text.trim(),
                                phone: phoneCtrl.text.trim().isEmpty ? null : phoneCtrl.text.trim(),
                                email: emailCtrl.text.trim().isEmpty ? null : emailCtrl.text.trim(),
                                speciality: specialityCtrl.text.trim().isEmpty ? null : specialityCtrl.text.trim(),
                                clinicName: clinicCtrl.text.trim().isEmpty ? null : clinicCtrl.text.trim(),
                                clinicAddress: location?.address,
                                latitude: location?.lat,
                                longitude: location?.lng,
                                dob: dob,
                              );
                            } else {
                              await _service.updateDoctor(
                                existing.id,
                                name: nameCtrl.text.trim(),
                                phone: phoneCtrl.text.trim().isEmpty ? null : phoneCtrl.text.trim(),
                                email: emailCtrl.text.trim().isEmpty ? null : emailCtrl.text.trim(),
                                speciality: specialityCtrl.text.trim().isEmpty ? null : specialityCtrl.text.trim(),
                                clinicName: clinicCtrl.text.trim().isEmpty ? null : clinicCtrl.text.trim(),
                                clinicAddress: location?.address,
                                latitude: location?.lat,
                                longitude: location?.lng,
                                dob: dob,
                              );
                            }
                            if (sheetCtx.mounted) Navigator.pop(sheetCtx);
                            _load();
                          } catch (e) {
                            setSheetState(() { submitting = false; submitError = existing == null ? 'Could not add doctor. Please try again.' : 'Could not save changes. Please try again.'; });
                          }
                        },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF00A6A4),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    elevation: 0,
                  ),
                  child: submitting
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : Text(existing == null ? 'Add Doctor' : 'Save Changes'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _initials(String name) {
    final parts = name.replaceFirst(RegExp(r'^Dr\.?\s*', caseSensitive: false), '').trim().split(RegExp(r'\s+'));
    final letters = parts.take(2).where((p) => p.isNotEmpty).map((p) => p[0].toUpperCase()).join();
    return letters.isEmpty ? '?' : letters;
  }

  Widget _fieldRow(String label, String? value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: TextStyle(fontSize: 12, color: Colors.grey.shade400)),
            Flexible(
              child: Text(
                value?.isNotEmpty == true ? value! : '—',
                style: const TextStyle(fontSize: 12.5, color: Color(0xFF1A1A1A)),
                textAlign: TextAlign.right,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      );

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
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Container(
                                  width: 44, height: 44,
                                  decoration: const BoxDecoration(color: Color(0xFF1A1A1A), shape: BoxShape.circle),
                                  alignment: Alignment.center,
                                  child: Text(
                                    _initials(d.name),
                                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 14),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(d.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                                      if (d.speciality != null)
                                        Text(d.speciality!, style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                                    ],
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(color: const Color(0xFFE6F7EE), borderRadius: BorderRadius.circular(20)),
                                  child: const Text('Active', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600, color: Color(0xFF1B8A5A))),
                                ),
                              ],
                            ),
                            const Padding(padding: EdgeInsets.symmetric(vertical: 10), child: Divider(height: 1)),
                            _fieldRow('Phone', d.phone),
                            _fieldRow('Email', d.email),
                            _fieldRow('Birthday', d.dob != null ? '${d.dob!.day}/${d.dob!.month}' : null),
                            _fieldRow('Clinic', d.clinicName ?? d.clinicAddress),
                            _fieldRow('Products', '${d.productCount}'),
                            const Padding(padding: EdgeInsets.symmetric(vertical: 10), child: Divider(height: 1)),
                            Row(
                              children: [
                                TextButton(
                                  onPressed: () => Navigator.push(ctx, MaterialPageRoute(builder: (_) => DoctorDetailScreen(doctor: d))),
                                  style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 0), tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                                  child: const Text('Manage Products', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Color(0xFF1A1A1A))),
                                ),
                                const SizedBox(width: 20),
                                TextButton(
                                  onPressed: () => _showDoctorForm(existing: d),
                                  style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 0), tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                                  child: const Text('Edit Profile', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Color(0xFF1A1A1A))),
                                ),
                                const Spacer(),
                                TextButton(
                                  onPressed: () => _deleteDoctor(d),
                                  style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 0), tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                                  child: const Text('Delete', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Colors.red)),
                                ),
                              ],
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
