import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../models/doctor.dart';
import '../../models/team_member.dart';
import '../../services/doctor_service.dart';
import '../../services/meeting_service.dart';
import '../../services/team_service.dart';

const _teal = Color(0xFF00A6A4);
const _ink = Color(0xFF1A1A1A);
const _months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

class TeamMemberDetailScreen extends StatefulWidget {
  final TeamMember member;
  const TeamMemberDetailScreen({super.key, required this.member});

  @override
  State<TeamMemberDetailScreen> createState() => _TeamMemberDetailScreenState();
}

class _TeamMemberDetailScreenState extends State<TeamMemberDetailScreen> {
  final _service = TeamService();
  DateTime _month = DateTime(DateTime.now().year, DateTime.now().month);
  List<AttendanceRecord> _attendance = [];
  List<DailyLog> _logs = [];
  bool _loading = true;
  bool _showPassword = false;
  late TeamMember _member;

  // The day whose logs are shown inline below the calendar — defaults to
  // today (only meaningful while viewing the current month), and updates
  // in place when a different day is tapped, instead of opening a popup
  // that would hide the logs behind it.
  int? _selectedDay;

  @override
  void initState() {
    super.initState();
    _member = widget.member;
    final now = DateTime.now();
    if (_month.year == now.year && _month.month == now.month) {
      _selectedDay = now.day;
    }
    _load();
  }

  Future<void> _editEmail() async {
    final ctrl = TextEditingController(text: _member.email ?? '');
    final result = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (sheetCtx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(sheetCtx).viewInsets.bottom + 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Email', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),
            TextField(
              controller: ctrl,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(labelText: 'Email address'),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(sheetCtx, ctrl.text.trim()),
                style: ElevatedButton.styleFrom(backgroundColor: _teal, foregroundColor: Colors.white),
                child: const Text('Save'),
              ),
            ),
          ],
        ),
      ),
    );
    if (result == null) return;
    try {
      await _service.updateTeamMemberEmail(_member.id, result);
      setState(() {
        _member = TeamMember(
          id: _member.id,
          phoneNumber: _member.phoneNumber,
          username: _member.username,
          plainPassword: _member.plainPassword,
          email: result.isEmpty ? null : result,
        );
      });
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not update email')));
      }
    }
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        _service.getMemberAttendanceByMonth(_member.id, _month.year, _month.month),
        _service.getMemberDailyLogs(_member.id, _month.year, _month.month),
      ]);
      setState(() {
        _attendance = results[0] as List<AttendanceRecord>;
        _logs = results[1] as List<DailyLog>;
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  void _changeMonth(int delta) {
    setState(() {
      _month = DateTime(_month.year, _month.month + delta);
      final now = DateTime.now();
      _selectedDay = (_month.year == now.year && _month.month == now.month) ? now.day : null;
    });
    _load();
  }

  Future<void> _scheduleMeetingForDay(BuildContext parentCtx, String dateStr) async {
    List<Doctor> doctors = [];
    try {
      doctors = await DoctorService().getDoctors();
    } catch (_) {}
    if (!parentCtx.mounted) return;

    String? doctorId;
    TimeOfDay time = const TimeOfDay(hour: 11, minute: 0);
    final notesCtrl = TextEditingController();
    String? error;
    bool submitting = false;

    await showModalBottomSheet<bool>(
      context: parentCtx,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (sheetCtx) => StatefulBuilder(
        builder: (sheetCtx, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(sheetCtx).viewInsets.bottom + 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Text('Schedule Meeting for ${_member.displayName}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, size: 20),
                    onPressed: () => Navigator.pop(sheetCtx),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              if (doctors.isEmpty)
                Text('No doctors found — add one first.', style: TextStyle(color: Colors.grey.shade500))
              else
                DropdownButtonFormField<String>(
                  initialValue: doctorId,
                  decoration: const InputDecoration(labelText: 'Doctor'),
                  items: doctors.map((d) => DropdownMenuItem(value: d.id, child: Text(d.name, overflow: TextOverflow.ellipsis))).toList(),
                  onChanged: (v) => setSheetState(() => doctorId = v),
                ),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: () async {
                  final picked = await showTimePicker(context: sheetCtx, initialTime: time);
                  if (picked != null) setSheetState(() => time = picked);
                },
                child: Text(time.format(sheetCtx)),
              ),
              const SizedBox(height: 12),
              TextField(controller: notesCtrl, maxLines: 2, decoration: const InputDecoration(labelText: 'Notes (optional)')),
              if (error != null) ...[
                const SizedBox(height: 8),
                Text(error!, style: const TextStyle(color: Colors.red, fontSize: 12.5)),
              ],
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  onPressed: submitting || doctorId == null
                      ? null
                      : () async {
                          setSheetState(() { submitting = true; error = null; });
                          try {
                            final scheduledAt = DateTime(
                              int.parse(dateStr.split('-')[0]),
                              int.parse(dateStr.split('-')[1]),
                              int.parse(dateStr.split('-')[2]),
                              time.hour,
                              time.minute,
                            );
                            await MeetingService().createMeeting(
                              doctorId: doctorId,
                              scheduledAt: scheduledAt,
                              notes: notesCtrl.text.trim().isEmpty ? null : notesCtrl.text.trim(),
                              assignedTo: _member.id,
                            );
                            if (sheetCtx.mounted) Navigator.pop(sheetCtx, true);
                          } catch (_) {
                            setSheetState(() { submitting = false; error = 'Could not schedule meeting'; });
                          }
                        },
                  style: ElevatedButton.styleFrom(backgroundColor: _teal, foregroundColor: Colors.white),
                  child: submitting
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Text('Schedule Meeting'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // Attendance-only sheet — deliberately doesn't include the day's logs, so
  // it can be freely opened/dismissed without ever hiding them; the logs
  // live inline on the page instead (see _buildDayLogsSection).
  Future<void> _showAttendanceSheet(int day) async {
    final dateStr = '${_month.year}-${_month.month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';
    final matches = _attendance.where((a) => a.date.endsWith('-${day.toString().padLeft(2, '0')}'));
    final existing = matches.isEmpty ? null : matches.first;

    final timeCtrl = TextEditingController(text: existing?.checkInTime.substring(0, 5) ?? '09:00');
    final noteCtrl = TextEditingController(text: existing?.description ?? '');
    String status = existing?.status ?? 'present';

    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (sheetCtx) => StatefulBuilder(
        builder: (sheetCtx, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(sheetCtx).viewInsets.bottom + 20),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Attendance — $day ${_months[_month.month - 1]}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    IconButton(
                      icon: const Icon(Icons.close, size: 20),
                      onPressed: () => Navigator.pop(sheetCtx),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: timeCtrl,
                  decoration: const InputDecoration(labelText: 'Check-in Time (HH:MM)'),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: status,
                  decoration: const InputDecoration(labelText: 'Status'),
                  items: const [
                    DropdownMenuItem(value: 'present', child: Text('Present')),
                    DropdownMenuItem(value: 'late', child: Text('Late')),
                    DropdownMenuItem(value: 'half-day', child: Text('Half Day')),
                    DropdownMenuItem(value: 'absent', child: Text('Absent')),
                  ],
                  onChanged: (v) => setSheetState(() => status = v ?? 'present'),
                ),
                const SizedBox(height: 12),
                TextField(controller: noteCtrl, decoration: const InputDecoration(labelText: 'Notes')),
                const SizedBox(height: 20),
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton(
                        onPressed: () async {
                          try {
                            await _service.markAttendance(
                              employeeId: _member.id,
                              date: dateStr,
                              checkInTime: timeCtrl.text.trim(),
                              status: status,
                              description: noteCtrl.text.trim().isEmpty ? null : noteCtrl.text.trim(),
                            );
                            if (sheetCtx.mounted) Navigator.pop(sheetCtx, true);
                          } catch (_) {
                            if (sheetCtx.mounted) {
                              ScaffoldMessenger.of(sheetCtx).showSnackBar(const SnackBar(content: Text('Could not save attendance')));
                            }
                          }
                        },
                        style: ElevatedButton.styleFrom(backgroundColor: _teal, foregroundColor: Colors.white),
                        child: Text(existing == null ? 'Mark' : 'Update'),
                      ),
                    ),
                    if (existing != null) ...[
                      const SizedBox(width: 8),
                      TextButton(
                        onPressed: () async {
                          try {
                            await _service.deleteAttendance(existing.id);
                            if (sheetCtx.mounted) Navigator.pop(sheetCtx, true);
                          } catch (_) {}
                        },
                        child: const Text('Remove', style: TextStyle(color: Colors.red)),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
    if (result == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    final daysInMonth = DateTime(_month.year, _month.month + 1, 0).day;
    final attendanceByDay = {for (final a in _attendance) int.parse(a.date.split('-')[2]): a};

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: Text(_member.displayName, style: const TextStyle(color: _ink, fontWeight: FontWeight.w600)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: _teal))
          : RefreshIndicator(
              onRefresh: _load,
              color: _teal,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      border: Border.all(color: Colors.grey.shade200),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Login Details', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                        const SizedBox(height: 12),
                        _detailRow('Name', _member.username?.isNotEmpty == true ? _member.username! : '—'),
                        const SizedBox(height: 8),
                        _detailRow('Phone', _member.phoneNumber, copyable: true),
                        const SizedBox(height: 8),
                        _detailRow(
                          'Email',
                          _member.email?.isNotEmpty == true ? _member.email! : '—',
                          trailing: TextButton(
                            onPressed: _editEmail,
                            style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 0), tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                            child: Text(_member.email?.isNotEmpty == true ? 'Edit' : 'Add', style: const TextStyle(fontSize: 12.5, color: _teal)),
                          ),
                        ),
                        const SizedBox(height: 8),
                        _detailRow(
                          'Password',
                          _member.plainPassword?.isNotEmpty == true
                              ? (_showPassword ? _member.plainPassword! : '••••••••')
                              : 'Not available',
                          copyable: _member.plainPassword?.isNotEmpty == true,
                          trailing: _member.plainPassword?.isNotEmpty == true
                              ? IconButton(
                                  icon: Icon(_showPassword ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 18, color: Colors.grey.shade600),
                                  onPressed: () => setState(() => _showPassword = !_showPassword),
                                  padding: EdgeInsets.zero,
                                  constraints: const BoxConstraints(),
                                  tooltip: _showPassword ? 'Hide password' : 'Show password',
                                )
                              : null,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      IconButton(icon: const Icon(Icons.chevron_left), onPressed: () => _changeMonth(-1)),
                      Text('${_months[_month.month - 1]} ${_month.year}', style: const TextStyle(fontWeight: FontWeight.w600)),
                      IconButton(icon: const Icon(Icons.chevron_right), onPressed: () => _changeMonth(1)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 7, mainAxisSpacing: 4, crossAxisSpacing: 4),
                    itemCount: daysInMonth,
                    itemBuilder: (ctx, i) {
                      final day = i + 1;
                      final rec = attendanceByDay[day];
                      final selected = _selectedDay == day;
                      Color bg = Colors.grey.shade50;
                      if (rec != null) {
                        bg = switch (rec.status) {
                          'present' => const Color(0xFFE6F7EE),
                          'late' => const Color(0xFFFFF6E0),
                          'half-day' => const Color(0xFFFFEEDD),
                          _ => const Color(0xFFFDE7E7),
                        };
                      }
                      return InkWell(
                        onTap: () => setState(() => _selectedDay = day),
                        borderRadius: BorderRadius.circular(8),
                        child: Container(
                          decoration: BoxDecoration(
                            color: bg,
                            borderRadius: BorderRadius.circular(8),
                            border: selected ? Border.all(color: _teal, width: 1.5) : null,
                          ),
                          alignment: Alignment.center,
                          child: Text('$day', style: TextStyle(fontSize: 12.5, fontWeight: selected ? FontWeight.w700 : FontWeight.w400)),
                        ),
                      );
                    },
                  ),
                  const SizedBox(height: 24),
                  _buildDayLogsSection(),
                ],
              ),
            ),
    );
  }

  // Logs for whichever day is selected on the calendar — updates in place
  // as different days are tapped, and stays visible/readable regardless of
  // whether the attendance or schedule-meeting sheets are open or closed.
  Widget _buildDayLogsSection() {
    if (_selectedDay == null) {
      return Text('Tap a day on the calendar to view its logs.', style: TextStyle(color: Colors.grey.shade400, fontSize: 13));
    }
    final day = _selectedDay!;
    final dayStr = day.toString().padLeft(2, '0');
    final dayLogs = _logs.where((l) => l.date.endsWith('-$dayStr')).toList();
    final dateStr = '${_month.year}-${_month.month.toString().padLeft(2, '0')}-$dayStr';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Logs — $day ${_months[_month.month - 1]}', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
        const SizedBox(height: 10),
        if (dayLogs.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text('No logs submitted for this day.', style: TextStyle(color: Colors.grey.shade400, fontSize: 13)),
          )
        else
          ...dayLogs.map((l) => Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(border: Border.all(color: Colors.grey.shade200), borderRadius: BorderRadius.circular(10)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(l.notes, style: const TextStyle(fontSize: 13)),
                    if (l.latitude != null && l.longitude != null) ...[
                      const SizedBox(height: 4),
                      InkWell(
                        onTap: () => launchUrl(
                          Uri.parse('https://www.google.com/maps?q=${l.latitude},${l.longitude}'),
                          mode: LaunchMode.externalApplication,
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.location_on, size: 12, color: _teal),
                            const SizedBox(width: 2),
                            Text(
                              l.address ?? 'View on map',
                              style: const TextStyle(fontSize: 11, color: _teal, decoration: TextDecoration.underline),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              )),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => _showAttendanceSheet(day),
                icon: const Icon(Icons.event_available_outlined, size: 18, color: _teal),
                label: const Text('Attendance', style: TextStyle(color: _teal)),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => _scheduleMeetingForDay(context, dateStr),
                icon: const Icon(Icons.calendar_month_outlined, size: 18, color: _teal),
                label: const Text('Meeting', style: TextStyle(color: _teal)),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _detailRow(String label, String value, {bool copyable = false, Widget? trailing}) {
    return Row(
      children: [
        SizedBox(width: 70, child: Text(label, style: TextStyle(fontSize: 12.5, color: Colors.grey.shade500))),
        Expanded(
          child: Text(value, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500), overflow: TextOverflow.ellipsis),
        ),
        if (trailing != null) trailing,
        if (copyable)
          IconButton(
            icon: Icon(Icons.copy_outlined, size: 16, color: Colors.grey.shade500),
            onPressed: () {
              Clipboard.setData(ClipboardData(text: value));
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('$label copied'), duration: const Duration(seconds: 1)),
              );
            },
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(),
            tooltip: 'Copy',
          ),
      ],
    );
  }
}
