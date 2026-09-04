import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../models/team_member.dart';
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

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        _service.getMemberAttendanceByMonth(widget.member.id, _month.year, _month.month),
        _service.getMemberDailyLogs(widget.member.id, _month.year, _month.month),
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
    setState(() => _month = DateTime(_month.year, _month.month + delta));
    _load();
  }

  Future<void> _markDay(int day) async {
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
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Mark Attendance — $day ${_months[_month.month - 1]}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
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
                            employeeId: widget.member.id,
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
        title: Text(widget.member.displayName, style: const TextStyle(color: _ink, fontWeight: FontWeight.w600)),
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
                        _detailRow('Name', widget.member.username?.isNotEmpty == true ? widget.member.username! : '—'),
                        const SizedBox(height: 8),
                        _detailRow('Phone', widget.member.phoneNumber, copyable: true),
                        const SizedBox(height: 8),
                        _detailRow(
                          'Password',
                          widget.member.plainPassword?.isNotEmpty == true
                              ? (_showPassword ? widget.member.plainPassword! : '••••••••')
                              : 'Not available',
                          copyable: widget.member.plainPassword?.isNotEmpty == true,
                          trailing: widget.member.plainPassword?.isNotEmpty == true
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
                        onTap: () => _markDay(day),
                        borderRadius: BorderRadius.circular(8),
                        child: Container(
                          decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8)),
                          alignment: Alignment.center,
                          child: Text('$day', style: const TextStyle(fontSize: 12.5)),
                        ),
                      );
                    },
                  ),
                  const SizedBox(height: 24),
                  const Text('Daily Logs', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                  const SizedBox(height: 10),
                  if (_logs.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Text('No logs submitted for ${_months[_month.month - 1]}.', style: TextStyle(color: Colors.grey.shade400, fontSize: 13)),
                    )
                  else
                    ..._logs.map((l) => Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(border: Border.all(color: Colors.grey.shade200), borderRadius: BorderRadius.circular(10)),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(l.date, style: TextStyle(fontSize: 11, color: Colors.grey.shade400)),
                                  if (l.latitude != null && l.longitude != null)
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
                              ),
                              const SizedBox(height: 4),
                              Text(l.notes, style: const TextStyle(fontSize: 13)),
                            ],
                          ),
                        )),
                ],
              ),
            ),
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
