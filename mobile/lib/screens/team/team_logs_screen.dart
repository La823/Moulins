import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../models/team_member.dart';
import '../../services/team_service.dart';

const _teal = Color(0xFF00A6A4);
const _ink = Color(0xFF1A1A1A);
const _months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// The partner's team-wide daily-logs view — every member's entries for the
// month, interleaved and newest-first. Mirrors the per-member log list on
// TeamMemberDetailScreen, but aggregated across the whole team.
class TeamLogsScreen extends StatefulWidget {
  const TeamLogsScreen({super.key});

  @override
  State<TeamLogsScreen> createState() => _TeamLogsScreenState();
}

class _TeamLogsScreenState extends State<TeamLogsScreen> {
  final _service = TeamService();
  DateTime _month = DateTime(DateTime.now().year, DateTime.now().month);
  List<TeamDailyLog> _logs = [];
  bool _loading = true;
  String _memberFilter = 'All';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final logs = await _service.getTeamDailyLogs(_month.year, _month.month);
      setState(() { _logs = logs; _loading = false; });
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
    final members = _logs.map((l) => l.memberName).toSet().toList()..sort();
    final visible = _memberFilter == 'All' ? _logs : _logs.where((l) => l.memberName == _memberFilter).toList();

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('Team Logs', style: TextStyle(color: _ink, fontWeight: FontWeight.w600)),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
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
            if (members.isNotEmpty) ...[
              const SizedBox(height: 8),
              SizedBox(
                height: 36,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  children: [
                    for (final m in ['All', ...members])
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          label: Text(m, style: TextStyle(fontSize: 12.5, color: _memberFilter == m ? Colors.white : Colors.grey.shade700)),
                          selected: _memberFilter == m,
                          onSelected: (_) => setState(() => _memberFilter = m),
                          selectedColor: _teal,
                          backgroundColor: Colors.grey.shade100,
                          showCheckmark: false,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20), side: BorderSide.none),
                        ),
                      ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 16),
            if (_loading)
              const Padding(padding: EdgeInsets.symmetric(vertical: 40), child: Center(child: CircularProgressIndicator(color: _teal)))
            else if (visible.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 20),
                child: Text('No logs submitted for ${_months[_month.month - 1]}.', style: TextStyle(color: Colors.grey.shade400, fontSize: 13)),
              )
            else
              ...visible.map((l) => Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(border: Border.all(color: Colors.grey.shade200), borderRadius: BorderRadius.circular(10)),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Expanded(
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(l.memberName, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
                                  const SizedBox(width: 8),
                                  Text(l.date, style: TextStyle(fontSize: 11, color: Colors.grey.shade400)),
                                ],
                              ),
                            ),
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
}
