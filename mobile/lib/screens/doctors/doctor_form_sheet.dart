import 'package:flutter/material.dart';
import 'package:flutter_contacts/flutter_contacts.dart';
import '../../models/doctor.dart';
import '../../services/doctor_service.dart';
import '../../utils/validators.dart';
import '../../widgets/location_picker_screen.dart';

const _teal = Color(0xFF00A6A4);

/// The Add / Edit Doctor sheet, used by the doctor list and the doctor page.
/// Returns the saved doctor, or null when closed without saving.
Future<Doctor?> showDoctorFormSheet(BuildContext context, {Doctor? existing}) {
  return showModalBottomSheet<Doctor>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true, // keeps the title clear of the status bar
    showDragHandle: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (_) => _DoctorForm(existing: existing),
  );
}

class _DoctorForm extends StatefulWidget {
  final Doctor? existing;
  const _DoctorForm({this.existing});

  @override
  State<_DoctorForm> createState() => _DoctorFormState();
}

class _DoctorFormState extends State<_DoctorForm> {
  late final _name = TextEditingController(text: widget.existing?.name ?? '');
  late final _phone = TextEditingController(text: widget.existing?.phone ?? '');
  late final _email = TextEditingController(text: widget.existing?.email ?? '');
  late final _speciality = TextEditingController(text: widget.existing?.speciality ?? '');
  late final _clinic = TextEditingController(text: widget.existing?.clinicName ?? '');
  DateTime? _dob;
  DateTime? _anniversary;
  PickedLocation? _location;
  bool _submitting = false;
  String? _error;

  bool get _isEdit => widget.existing != null;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    _dob = e?.dob;
    _anniversary = e?.anniversary;
    if (e != null && e.latitude != null && e.longitude != null) {
      _location = PickedLocation(lat: e.latitude!, lng: e.longitude!, address: e.clinicAddress);
    }
  }

  @override
  void dispose() {
    for (final c in [_name, _phone, _email, _speciality, _clinic]) {
      c.dispose();
    }
    super.dispose();
  }

  String? _text(TextEditingController c) => c.text.trim().isEmpty ? null : c.text.trim();

  Future<void> _pickContact() async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      // readonly: we only read the picked contact; WRITE_CONTACTS isn't declared
      final granted = await FlutterContacts.requestPermission(readonly: true);
      if (!granted) {
        messenger.showSnackBar(const SnackBar(content: Text('Contacts permission is required to pick a number')));
        return;
      }
      final contact = await FlutterContacts.openExternalPick();
      if (contact == null) return;
      setState(() {
        if (contact.phones.isNotEmpty) _phone.text = contact.phones.first.number;
        if (contact.emails.isNotEmpty) _email.text = contact.emails.first.address;
        if (_name.text.trim().isEmpty && contact.displayName.isNotEmpty) _name.text = contact.displayName;
      });
    } catch (_) {
      messenger.showSnackBar(const SnackBar(content: Text('Could not open contacts')));
    }
  }

  Future<void> _pickLocation() async {
    final picked = await Navigator.push<PickedLocation>(
      context,
      MaterialPageRoute(builder: (_) => LocationPickerScreen(initial: _location)),
    );
    if (picked != null) setState(() => _location = picked);
  }

  Future<DateTime?> _pickDate(DateTime? current, DateTime fallback) => showDatePicker(
        context: context,
        initialDate: current ?? fallback,
        firstDate: DateTime(1930),
        lastDate: DateTime.now(),
      );

  Future<void> _save() async {
    if (_name.text.trim().isEmpty) {
      setState(() => _error = 'Please enter the doctor\'s name.');
      return;
    }
    String? phone;
    if (_phone.text.trim().isNotEmpty) {
      phone = Validators.normalizePhone(_phone.text);
      if (phone == null) {
        setState(() => _error = Validators.phoneError(_phone.text));
        return;
      }
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    final service = DoctorService();
    try {
      Doctor saved;
      if (!_isEdit) {
        saved = await service.createDoctor(
          name: _name.text.trim(),
          phone: phone,
          email: _text(_email),
          speciality: _text(_speciality),
          clinicName: _text(_clinic),
          clinicAddress: _location?.address,
          latitude: _location?.lat,
          longitude: _location?.lng,
          dob: _dob,
          anniversary: _anniversary,
        );
      } else {
        final e = widget.existing!;
        await service.updateDoctor(
          e.id,
          name: _name.text.trim(),
          phone: phone,
          email: _text(_email),
          speciality: _text(_speciality),
          clinicName: _text(_clinic),
          clinicAddress: _location?.address,
          latitude: _location?.lat,
          longitude: _location?.lng,
          dob: _dob,
          anniversary: _anniversary,
        );
        saved = Doctor(
          id: e.id,
          name: _name.text.trim(),
          phone: phone,
          email: _text(_email),
          speciality: _text(_speciality),
          clinicName: _text(_clinic),
          clinicAddress: _location?.address,
          latitude: _location?.lat,
          longitude: _location?.lng,
          dob: _dob,
          anniversary: _anniversary,
          lastMeetingAt: e.lastMeetingAt,
          lastMeetingNotes: e.lastMeetingNotes,
          ownerName: e.ownerName,
          ownerPhone: e.ownerPhone,
          productCount: e.productCount,
        );
      }
      if (mounted) Navigator.pop(context, saved);
    } catch (_) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _error = _isEdit ? 'Could not save changes. Please try again.' : 'Could not add doctor. Please try again.';
        });
      }
    }
  }

  InputDecoration _decoration(String label, IconData icon, {Widget? suffix}) => InputDecoration(
        labelText: label,
        isDense: true,
        prefixIcon: Icon(icon, size: 19, color: Colors.grey.shade500),
        suffixIcon: suffix,
        filled: true,
        fillColor: Colors.grey.shade50,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _teal)),
      );

  Widget _field(TextEditingController c, String label, IconData icon,
          {TextInputType type = TextInputType.text, Widget? suffix, TextCapitalization caps = TextCapitalization.words}) =>
      TextField(
        controller: c,
        keyboardType: type,
        textCapitalization: caps,
        textInputAction: TextInputAction.next,
        style: const TextStyle(fontSize: 14.5),
        decoration: _decoration(label, icon, suffix: suffix),
      );

  Widget _sectionLabel(String text) => Padding(
        padding: const EdgeInsets.only(top: 18, bottom: 8, left: 2),
        child: Text(text.toUpperCase(),
            style: TextStyle(fontSize: 11, letterSpacing: 0.8, fontWeight: FontWeight.w600, color: Colors.grey.shade500)),
      );

  // a tappable box that looks like the text fields (location, dates)
  Widget _tapBox({required IconData icon, required String label, String? value, required VoidCallback onTap}) => InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: Colors.grey.shade50,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Colors.grey.shade200),
          ),
          child: Row(children: [
            Icon(icon, size: 19, color: value == null ? Colors.grey.shade500 : _teal),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                Text(label, style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
                const SizedBox(height: 1),
                Text(value ?? 'Not set',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 13.5, color: value == null ? Colors.grey.shade400 : Colors.black87)),
              ]),
            ),
          ]),
        ),
      );

  String _date(DateTime d) {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day} ${m[d.month - 1]} ${d.year}';
  }

  @override
  Widget build(BuildContext context) {
    final loc = _location;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 8, 0),
            child: Row(children: [
              Expanded(
                child: Text(_isEdit ? 'Edit Doctor' : 'Add Doctor',
                    style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700, color: Color(0xFF1A1A1A))),
              ),
              IconButton(
                icon: Icon(Icons.close, color: Colors.grey.shade600),
                tooltip: 'Close',
                onPressed: () => Navigator.pop(context),
              ),
            ]),
          ),
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  _sectionLabel('Contact'),
                  _field(_name, 'Doctor name *', Icons.person_outline),
                  const SizedBox(height: 10),
                  _field(
                    _phone,
                    'Phone',
                    Icons.phone_outlined,
                    type: TextInputType.phone,
                    caps: TextCapitalization.none,
                    suffix: IconButton(
                      icon: const Icon(Icons.contacts_outlined, color: _teal, size: 20),
                      tooltip: 'Pick from contacts',
                      onPressed: _pickContact,
                    ),
                  ),
                  const SizedBox(height: 10),
                  _field(_email, 'Email', Icons.mail_outline, type: TextInputType.emailAddress, caps: TextCapitalization.none),
                  _sectionLabel('Practice'),
                  _field(_speciality, 'Speciality', Icons.medical_services_outlined),
                  const SizedBox(height: 10),
                  _field(_clinic, 'Clinic name', Icons.local_hospital_outlined),
                  const SizedBox(height: 10),
                  _tapBox(
                    icon: Icons.location_on_outlined,
                    label: 'Clinic location',
                    value: loc == null ? null : (loc.address ?? '${loc.lat.toStringAsFixed(5)}, ${loc.lng.toStringAsFixed(5)}'),
                    onTap: _pickLocation,
                  ),
                  _sectionLabel('Reminders'),
                  Row(children: [
                    Expanded(
                      child: _tapBox(
                        icon: Icons.cake_outlined,
                        label: 'Birthday',
                        value: _dob == null ? null : _date(_dob!),
                        onTap: () async {
                          final d = await _pickDate(_dob, DateTime(1985, 1, 1));
                          if (d != null) setState(() => _dob = d);
                        },
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _tapBox(
                        icon: Icons.celebration_outlined,
                        label: 'Anniversary',
                        value: _anniversary == null ? null : _date(_anniversary!),
                        onTap: () async {
                          final d = await _pickDate(_anniversary, DateTime(2010, 1, 1));
                          if (d != null) setState(() => _anniversary = d);
                        },
                      ),
                    ),
                  ]),
                  const SizedBox(height: 6),
                  Text(
                    'Added to your meetings calendar every year, with a notification each day for the 10 days before.',
                    style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                  ),
                ],
              ),
            ),
          ),
          SafeArea(
            top: false,
            child: Container(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 14),
              decoration: BoxDecoration(border: Border(top: BorderSide(color: Colors.grey.shade100))),
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                if (_error != null) ...[
                  Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 12.5)),
                  const SizedBox(height: 8),
                ],
                SizedBox(
                  height: 48,
                  child: ElevatedButton(
                    onPressed: _submitting ? null : _save,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _teal,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      elevation: 0,
                    ),
                    child: _submitting
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : Text(_isEdit ? 'Save Changes' : 'Add Doctor',
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                  ),
                ),
              ]),
            ),
          ),
        ],
      ),
    );
  }
}
