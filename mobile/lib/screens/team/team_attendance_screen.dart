import 'package:flutter/material.dart';
import '../../models/team_member.dart';
import '../../services/team_service.dart';

const _teal = Color(0xFF00A6A4);
const _ink = Color(0xFF1A1A1A);

// Day-by-day marker for the whole team at once — pick a date, see every
// member, mark each. Mirrors the web partner-panel Attendance page.
class TeamAttendanceScreen extends StatefulWidget {
  const TeamAttendanceScreen({super.key});

  @override
  State<TeamAttendanceScreen> createState() => _TeamAttendanceScreenState();
}

class _TeamAttendanceScreenState extends State<TeamAttendanceScreen> {
  final _service = TeamService();
  DateTime _date = DateTime.now();
  List<TeamMember> _members = [];
  List<AttendanceRecord> _records = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  String get _dateStr => '${_date.year}-${_date.month.toString().padLeft(2, '0')}-${_date.day.toString().padLeft(2, '0')}';

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        _service.getTeamMembers(),
        _service.getTeamAttendanceByDate(_dateStr),
      ]);
      setState(() {
        _members = results[0] as List<TeamMember>;
        _records = results[1] as List<AttendanceRecord>;
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null) {
      setState(() => _date = picked);
      _load();
    }
  }

  Future<void> _markMember(TeamMember member, AttendanceRecord? existing) async {
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
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Mark — ${member.displayName}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              const SizedBox(height: 16),
              TextField(controller: timeCtrl, decoration: const InputDecoration(labelText: 'Check-in Time (HH:MM)')),
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
                            employeeId: member.id,
                            date: _dateStr,
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
    );
    if (result == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('Team Attendance', style: TextStyle(color: _ink, fontWeight: FontWeight.w600)),
        actions: [
          IconButton(icon: const Icon(Icons.calendar_today_outlined, color: _teal, size: 20), onPressed: _pickDate),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: _teal))
          : Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(
                    '${_date.day}/${_date.month}/${_date.year} · ${_records.length}/${_members.length} marked',
                    style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
                  ),
                ),
                Expanded(
                  child: _members.isEmpty
                      ? Center(child: Text('No team members yet', style: TextStyle(color: Colors.grey.shade400)))
                      : RefreshIndicator(
                          onRefresh: _load,
                          color: _teal,
                          child: ListView.separated(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            itemCount: _members.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 10),
                            itemBuilder: (ctx, i) {
                              final m = _members[i];
                              final matches = _records.where((r) => r.employeeId == m.id);
                              final rec = matches.isEmpty ? null : matches.first;
                              return InkWell(
                                onTap: () => _markMember(m, rec),
                                borderRadius: BorderRadius.circular(12),
                                child: Container(
                                  padding: const EdgeInsets.all(14),
                                  decoration: BoxDecoration(
                                    border: Border.all(color: Colors.grey.shade200),
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Row(
                                    children: [
                                      Container(
                                        width: 36, height: 36,
                                        decoration: BoxDecoration(
                                          shape: BoxShape.circle,
                                          color: rec == null ? Colors.grey.shade100 : const Color(0xFFE6F7EE),
                                        ),
                                        alignment: Alignment.center,
                                        child: Text(
                                          m.displayName.isNotEmpty ? m.displayName[0].toUpperCase() : '?',
                                          style: TextStyle(fontWeight: FontWeight.w600, color: rec == null ? Colors.grey.shade500 : const Color(0xFF1B8A5A)),
                                        ),
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(m.displayName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                                            Text(
                                              rec == null ? 'Not marked' : '${rec.checkInTime.substring(0, 5)} · ${rec.status}',
                                              style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
                                            ),
                                          ],
                                        ),
                                      ),
                                      const Icon(Icons.chevron_right, color: Colors.grey),
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                ),
              ],
            ),
    );
  }
}
