import 'package:flutter/material.dart';
import '../../models/team_member.dart';
import '../../services/team_service.dart';

const _teal = Color(0xFF00A6A4);
const _ink = Color(0xFF1A1A1A);
const _months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

class MyAttendanceScreen extends StatefulWidget {
  const MyAttendanceScreen({super.key});

  @override
  State<MyAttendanceScreen> createState() => _MyAttendanceScreenState();
}

class _MyAttendanceScreenState extends State<MyAttendanceScreen> {
  final _service = SelfService();
  DateTime _month = DateTime(DateTime.now().year, DateTime.now().month);
  List<AttendanceRecord> _attendance = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final a = await _service.getMyAttendance(_month.year, _month.month);
      setState(() { _attendance = a; _loading = false; });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  void _changeMonth(int delta) {
    setState(() => _month = DateTime(_month.year, _month.month + delta));
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final daysInMonth = DateTime(_month.year, _month.month + 1, 0).day;
    final attendanceByDay = {for (final a in _attendance) int.parse(a.date.split('-')[2]): a};
    final presentCount = _attendance.where((a) => a.status == 'present').length;
    final lateCount = _attendance.where((a) => a.status == 'late').length;
    final absentCount = _attendance.where((a) => a.status == 'absent').length;

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('My Attendance', style: TextStyle(color: _ink, fontWeight: FontWeight.w600)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: _teal))
          : RefreshIndicator(
              onRefresh: _load,
              color: _teal,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Row(
                    children: [
                      _statCard('Present', presentCount, const Color(0xFFE6F7EE), const Color(0xFF1B8A5A)),
                      const SizedBox(width: 8),
                      _statCard('Late', lateCount, const Color(0xFFFFF6E0), const Color(0xFFB8860B)),
                      const SizedBox(width: 8),
                      _statCard('Absent', absentCount, const Color(0xFFFDE7E7), const Color(0xFFC0392B)),
                    ],
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
                      return Container(
                        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8)),
                        alignment: Alignment.center,
                        child: Text('$day', style: const TextStyle(fontSize: 12.5)),
                      );
                    },
                  ),
                ],
              ),
            ),
    );
  }

  Widget _statCard(String label, int value, Color bg, Color fg) => Expanded(
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('$value', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: fg)),
              Text(label, style: TextStyle(fontSize: 11, color: fg)),
            ],
          ),
        ),
      );
}
