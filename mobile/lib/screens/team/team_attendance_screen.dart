import 'package:flutter/material.dart';
import '../../models/team_member.dart';
import '../../services/team_service.dart';

const _teal = Color(0xFF00A6A4);
const _ink = Color(0xFF1A1A1A);
const _months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Calendar-based marker for the whole team — pick a month, see which days
// have attendance marked (dot count per day), tap a day to see and mark
// every team member for that specific date. Mirrors the web partner-panel
// Attendance page's calendar + day-panel layout.
class TeamAttendanceScreen extends StatefulWidget {
  const TeamAttendanceScreen({super.key});

  @override
  State<TeamAttendanceScreen> createState() => _TeamAttendanceScreenState();
}

class _TeamAttendanceScreenState extends State<TeamAttendanceScreen> {
  final _service = TeamService();
  DateTime _month = DateTime(DateTime.now().year, DateTime.now().month);
  List<TeamMember> _members = [];
  List<AttendanceRecord> _monthAttendance = [];
  List<AttendanceRecord> _dayAttendance = [];
  int? _selectedDay;
  bool _loading = true;
  bool _loadingDay = false;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    if (_month.year == now.year && _month.month == now.month) {
      _selectedDay = now.day;
    }
    _loadMonth();
  }

  Future<void> _loadMonth() async {
    setState(() => _loading = true);
    try {
      final members = await _service.getTeamMembers();
      final perMember = await Future.wait(
        members.map((m) => _service.getMemberAttendanceByMonth(m.id, _month.year, _month.month).catchError((_) => <AttendanceRecord>[])),
      );
      setState(() {
        _members = members;
        _monthAttendance = perMember.expand((l) => l).toList();
        _loading = false;
      });
      if (_selectedDay != null) _loadDay(_selectedDay!);
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  Future<void> _loadDay(int day) async {
    setState(() => _loadingDay = true);
    try {
      final dateStr = '${_month.year}-${_month.month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';
      final records = await _service.getTeamAttendanceByDate(dateStr);
      setState(() {
        _dayAttendance = records;
        _loadingDay = false;
      });
    } catch (_) {
      setState(() { _dayAttendance = []; _loadingDay = false; });
    }
  }

  void _changeMonth(int delta) {
    setState(() {
      _month = DateTime(_month.year, _month.month + delta);
      final now = DateTime.now();
      _selectedDay = (_month.year == now.year && _month.month == now.month) ? now.day : null;
      _dayAttendance = [];
    });
    _loadMonth();
  }

  void _selectDay(int day) {
    setState(() => _selectedDay = day);
    _loadDay(day);
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
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(child: Text('Mark — ${member.displayName}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold))),
                  IconButton(
                    icon: const Icon(Icons.close, size: 20),
                    onPressed: () => Navigator.pop(sheetCtx),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                  ),
                ],
              ),
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
                        if (_selectedDay == null) return;
                        try {
                          final dateStr = '${_month.year}-${_month.month.toString().padLeft(2, '0')}-${_selectedDay!.toString().padLeft(2, '0')}';
                          await _service.markAttendance(
                            employeeId: member.id,
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
    );
    if (result == true) {
      _loadDay(_selectedDay!);
      _loadMonth();
    }
  }

  @override
  Widget build(BuildContext context) {
    final daysInMonth = DateTime(_month.year, _month.month + 1, 0).day;
    final countByDay = <int, int>{};
    for (final a in _monthAttendance) {
      final day = int.parse(a.date.split('-')[2]);
      countByDay[day] = (countByDay[day] ?? 0) + 1;
    }
    final now = DateTime.now();

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('Team Attendance', style: TextStyle(color: _ink, fontWeight: FontWeight.w600)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: _teal))
          : _members.isEmpty
              ? Center(child: Text('No team members yet', style: TextStyle(color: Colors.grey.shade400)))
              : RefreshIndicator(
                  onRefresh: _loadMonth,
                  color: _teal,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          IconButton(icon: const Icon(Icons.chevron_left), onPressed: () => _changeMonth(-1)),
                          Text('${_months[_month.month - 1]} ${_month.year}', style: const TextStyle(fontWeight: FontWeight.w600)),
                          IconButton(icon: const Icon(Icons.chevron_right), onPressed: () => _changeMonth(1)),
                        ],
                      ),
                      const SizedBox(height: 4),
                      GridView.builder(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 7, mainAxisSpacing: 4, crossAxisSpacing: 4),
                        itemCount: daysInMonth,
                        itemBuilder: (ctx, i) {
                          final day = i + 1;
                          final count = countByDay[day] ?? 0;
                          final selected = _selectedDay == day;
                          final isToday = day == now.day && _month.year == now.year && _month.month == now.month;
                          return InkWell(
                            onTap: () => _selectDay(day),
                            borderRadius: BorderRadius.circular(8),
                            child: Container(
                              decoration: BoxDecoration(
                                color: selected ? _ink : (isToday ? const Color(0xFFFDECEC) : Colors.grey.shade50),
                                borderRadius: BorderRadius.circular(8),
                                border: selected ? null : (isToday ? Border.all(color: const Color(0xFFF3B9B9)) : null),
                              ),
                              alignment: Alignment.center,
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Text(
                                    '$day',
                                    style: TextStyle(
                                      fontSize: 12.5,
                                      fontWeight: selected ? FontWeight.w700 : FontWeight.w400,
                                      color: selected ? Colors.white : (isToday ? const Color(0xFFAC2528) : _ink),
                                    ),
                                  ),
                                  if (count > 0) ...[
                                    const SizedBox(height: 2),
                                    Container(
                                      width: 4, height: 4,
                                      decoration: BoxDecoration(
                                        shape: BoxShape.circle,
                                        color: selected ? Colors.white.withValues(alpha: 0.7) : const Color(0xFF4CAF50),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                      const SizedBox(height: 20),
                      if (_selectedDay == null)
                        Text('Tap a day on the calendar to view and mark attendance.', style: TextStyle(color: Colors.grey.shade400, fontSize: 13))
                      else ...[
                        Text(
                          '$_selectedDay ${_months[_month.month - 1]} ${_month.year}',
                          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${_dayAttendance.length}/${_members.length} marked',
                          style: TextStyle(fontSize: 12.5, color: Colors.grey.shade500),
                        ),
                        const SizedBox(height: 12),
                        if (_loadingDay)
                          const Padding(
                            padding: EdgeInsets.symmetric(vertical: 24),
                            child: Center(child: CircularProgressIndicator(color: _teal)),
                          )
                        else
                          ..._members.map((m) {
                            final matches = _dayAttendance.where((r) => r.employeeId == m.id);
                            final rec = matches.isEmpty ? null : matches.first;
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: InkWell(
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
                              ),
                            );
                          }),
                      ],
                    ],
                  ),
                ),
    );
  }
}
