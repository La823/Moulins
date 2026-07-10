import 'package:flutter/material.dart';
import '../../models/doctor.dart';
import '../../models/meeting.dart';
import '../../services/doctor_service.dart';
import '../../services/meeting_service.dart';
import '../../services/request_service.dart';
import '../../widgets/notification_bell_button.dart';
import '../../widgets/profile_button.dart';

const _teal = Color(0xFF00A6A4);
const _ink = Color(0xFF1A1A1A);

class MeetingsScreen extends StatefulWidget {
  final String? preselectedDoctorId;
  const MeetingsScreen({super.key, this.preselectedDoctorId});

  @override
  State<MeetingsScreen> createState() => _MeetingsScreenState();
}

class _MeetingsScreenState extends State<MeetingsScreen> {
  List<Meeting> _meetings = [];
  bool _loading = true;
  final _meetingService = MeetingService();
  String? _editingMomId;
  final _momCtrl = TextEditingController();
  bool _savingMom = false;

  @override
  void initState() {
    super.initState();
    _load();
    if (widget.preselectedDoctorId != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _showScheduleSheet(preselectedDoctorId: widget.preselectedDoctorId);
      });
    }
  }

  Future<void> _load() async {
    try {
      final m = await _meetingService.getMeetings();
      setState(() { _meetings = m; _loading = false; });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  Future<void> _updateStatus(Meeting m, String status) async {
    try {
      await _meetingService.updateMeetingStatus(m.id, status);
      _load();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not update meeting')),
        );
      }
    }
  }

  void _startEditMom(Meeting m) {
    setState(() {
      _editingMomId = m.id;
      _momCtrl.text = m.mom ?? '';
    });
  }

  Future<void> _saveMom(String id) async {
    setState(() => _savingMom = true);
    try {
      await _meetingService.updateMeetingMom(id, _momCtrl.text.trim().isEmpty ? null : _momCtrl.text.trim());
      setState(() => _editingMomId = null);
      _load();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not save MOM')),
        );
      }
    } finally {
      if (mounted) setState(() => _savingMom = false);
    }
  }

  void _showScheduleSheet({String? preselectedDoctorId}) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _ScheduleMeetingSheet(
        preselectedDoctorId: preselectedDoctorId,
        onScheduled: _load,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final upcoming = _meetings.where((m) => m.status == 'upcoming').toList()
      ..sort((a, b) => a.scheduledAt.compareTo(b.scheduledAt));

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('My Meetings', style: TextStyle(color: _ink, fontWeight: FontWeight.w600)),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: _teal),
            onPressed: () => _showScheduleSheet(),
          ),
          const NotificationBellButton(),
          const ProfileButton(),
          const SizedBox(width: 4),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: _teal))
          : upcoming.isEmpty
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.calendar_today_outlined, size: 64, color: Colors.grey.shade300),
                      const SizedBox(height: 16),
                      const Text('No upcoming meetings', style: TextStyle(color: Colors.grey, fontSize: 16)),
                      const SizedBox(height: 12),
                      TextButton.icon(
                        icon: const Icon(Icons.add, color: _teal),
                        label: const Text('Schedule Meeting', style: TextStyle(color: _teal)),
                        onPressed: () => _showScheduleSheet(),
                      ),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  color: _teal,
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: upcoming.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (ctx, i) {
                      final m = upcoming[i];
                      return Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          border: Border.all(color: Colors.grey.shade200),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Dr. ${m.doctorName}', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                            const SizedBox(height: 4),
                            Text(
                              _formatDateTime(m.scheduledAt),
                              style: TextStyle(fontSize: 12.5, color: Colors.grey.shade500),
                            ),
                            if (m.notes != null && m.notes!.isNotEmpty) ...[
                              const SizedBox(height: 6),
                              Text(m.notes!, style: TextStyle(fontSize: 12.5, color: Colors.grey.shade600)),
                            ],
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                TextButton(
                                  onPressed: () => _updateStatus(m, 'completed'),
                                  style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 0)),
                                  child: const Text('Mark done', style: TextStyle(fontSize: 12.5, color: Colors.green, fontWeight: FontWeight.w600)),
                                ),
                                const SizedBox(width: 16),
                                TextButton(
                                  onPressed: () => _updateStatus(m, 'cancelled'),
                                  style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 0)),
                                  child: const Text('Cancel', style: TextStyle(fontSize: 12.5, color: Colors.red, fontWeight: FontWeight.w600)),
                                ),
                              ],
                            ),
                            const SizedBox(height: 10),
                            Container(height: 1, color: Colors.grey.shade100),
                            const SizedBox(height: 10),
                            if (_editingMomId == m.id) ...[
                              TextField(
                                controller: _momCtrl,
                                maxLines: 2,
                                autofocus: true,
                                style: const TextStyle(fontSize: 12.5),
                                decoration: InputDecoration(
                                  hintText: 'What was discussed / decided...',
                                  isDense: true,
                                  filled: true,
                                  fillColor: Colors.grey.shade50,
                                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide(color: Colors.grey.shade200)),
                                ),
                              ),
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  TextButton(
                                    onPressed: _savingMom ? null : () => _saveMom(m.id),
                                    style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 0)),
                                    child: Text(_savingMom ? 'Saving...' : 'Save', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: _ink)),
                                  ),
                                  const SizedBox(width: 16),
                                  TextButton(
                                    onPressed: () => setState(() => _editingMomId = null),
                                    style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 0)),
                                    child: Text('Cancel', style: TextStyle(fontSize: 12.5, color: Colors.grey.shade500)),
                                  ),
                                ],
                              ),
                            ] else if (m.mom != null && m.mom!.isNotEmpty) ...[
                              Text('MOM', style: TextStyle(fontSize: 10, letterSpacing: 0.5, color: Colors.grey.shade400)),
                              const SizedBox(height: 2),
                              Text(m.mom!, style: TextStyle(fontSize: 12.5, color: Colors.grey.shade600)),
                              const SizedBox(height: 6),
                              GestureDetector(
                                onTap: () => _startEditMom(m),
                                child: const Text('Edit', style: TextStyle(fontSize: 12, color: Colors.blue)),
                              ),
                            ] else
                              GestureDetector(
                                onTap: () => _startEditMom(m),
                                child: const Text('+ Add MOM', style: TextStyle(fontSize: 12, color: Colors.blue)),
                              ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
    );
  }
}

String _formatDateTime(DateTime dt) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  final hour = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
  final ampm = dt.hour >= 12 ? 'PM' : 'AM';
  final minute = dt.minute.toString().padLeft(2, '0');
  return '${months[dt.month - 1]} ${dt.day}, $hour:$minute $ampm';
}

class _ScheduleMeetingSheet extends StatefulWidget {
  final String? preselectedDoctorId;
  final VoidCallback onScheduled;
  const _ScheduleMeetingSheet({this.preselectedDoctorId, required this.onScheduled});

  @override
  State<_ScheduleMeetingSheet> createState() => _ScheduleMeetingSheetState();
}

class _ScheduleMeetingSheetState extends State<_ScheduleMeetingSheet> {
  List<Doctor> _doctors = [];
  String? _selectedDoctorId;
  DateTime? _date;
  TimeOfDay? _time;
  final _notesCtrl = TextEditingController();
  final _momCtrl = TextEditingController();
  final _requestCtrl = TextEditingController();
  bool _loadingDoctors = true;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _selectedDoctorId = widget.preselectedDoctorId;
    DoctorService().getDoctors().then((d) {
      if (mounted) setState(() { _doctors = d; _loadingDoctors = false; });
    }).catchError((_) {
      if (mounted) setState(() => _loadingDoctors = false);
    });
  }

  Future<void> _submit() async {
    if (_selectedDoctorId == null || _date == null || _time == null) {
      setState(() => _error = 'Doctor, date and time are required');
      return;
    }
    setState(() { _submitting = true; _error = null; });
    try {
      final scheduledAt = DateTime(_date!.year, _date!.month, _date!.day, _time!.hour, _time!.minute);
      await MeetingService().createMeeting(
        doctorId: _selectedDoctorId!,
        scheduledAt: scheduledAt,
        notes: _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
        mom: _momCtrl.text.trim().isEmpty ? null : _momCtrl.text.trim(),
      );

      // A doctor's ask gets flagged to the company as a request, separate
      // from the meeting notes, so it actually surfaces on the admin side.
      if (_requestCtrl.text.trim().isNotEmpty) {
        final matches = _doctors.where((d) => d.id == _selectedDoctorId);
        final doctorName = matches.isEmpty ? 'doctor' : matches.first.name;
        try {
          await RequestService().createRequest(
            '[Meeting with Dr. $doctorName on ${_date!.year}-${_date!.month.toString().padLeft(2, '0')}-${_date!.day.toString().padLeft(2, '0')}] ${_requestCtrl.text.trim()}',
          );
        } catch (_) {}
      }

      if (mounted) {
        Navigator.pop(context);
        widget.onScheduled();
      }
    } catch (e) {
      setState(() => _error = 'Could not schedule meeting');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      child: SingleChildScrollView(
        child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Schedule Meeting', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 20),
          _loadingDoctors
              ? const Center(child: CircularProgressIndicator(color: _teal))
              : DropdownButtonFormField<String>(
                  initialValue: _selectedDoctorId,
                  decoration: InputDecoration(
                    labelText: 'Doctor',
                    filled: true,
                    fillColor: Colors.grey.shade50,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
                  ),
                  items: _doctors
                      .map((d) => DropdownMenuItem(value: d.id, child: Text(d.name, overflow: TextOverflow.ellipsis)))
                      .toList(),
                  onChanged: (v) => setState(() => _selectedDoctorId = v),
                ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: DateTime.now(),
                      firstDate: DateTime.now(),
                      lastDate: DateTime.now().add(const Duration(days: 365)),
                    );
                    if (picked != null) setState(() => _date = picked);
                  },
                  child: Text(_date == null ? 'Pick date' : '${_date!.month}/${_date!.day}/${_date!.year}'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OutlinedButton(
                  onPressed: () async {
                    final picked = await showTimePicker(context: context, initialTime: TimeOfDay.now());
                    if (picked != null) setState(() => _time = picked);
                  },
                  child: Text(_time == null ? 'Pick time' : _time!.format(context)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _notesCtrl,
            maxLines: 2,
            decoration: InputDecoration(
              labelText: 'Notes (optional)',
              filled: true,
              fillColor: Colors.grey.shade50,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _momCtrl,
            maxLines: 2,
            decoration: InputDecoration(
              labelText: 'MOM — Minutes of Meeting (optional)',
              hintText: 'What was discussed / decided...',
              filled: true,
              fillColor: Colors.grey.shade50,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _requestCtrl,
            maxLines: 2,
            decoration: InputDecoration(
              labelText: 'Doctor requested something? (optional)',
              hintText: 'e.g. needs more samples, a brochure...',
              filled: true,
              fillColor: Colors.grey.shade50,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'This gets flagged to our team separately so it doesn\'t get lost in the notes.',
            style: TextStyle(fontSize: 11, color: Colors.grey.shade400),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 12.5)),
          ],
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            height: 48,
            child: ElevatedButton(
              onPressed: _submitting ? null : _submit,
              style: ElevatedButton.styleFrom(
                backgroundColor: _teal,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                elevation: 0,
              ),
              child: _submitting
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Schedule Meeting'),
            ),
          ),
        ],
        ),
      ),
    );
  }
}
