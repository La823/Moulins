import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import '../../models/team_member.dart';
import '../../services/team_service.dart';

const _teal = Color(0xFF00A6A4);
const _ink = Color(0xFF1A1A1A);
const _months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

class MyDailyLogScreen extends StatefulWidget {
  const MyDailyLogScreen({super.key});

  @override
  State<MyDailyLogScreen> createState() => _MyDailyLogScreenState();
}

class _MyDailyLogScreenState extends State<MyDailyLogScreen> {
  final _service = SelfService();
  DateTime _month = DateTime(DateTime.now().year, DateTime.now().month);
  List<DailyLog> _logs = [];
  bool _loading = true;
  bool _submitting = false;
  final _notesCtrl = TextEditingController();
  DateTime _date = DateTime.now();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final l = await _service.getMyDailyLogs(_month.year, _month.month);
      setState(() { _logs = l; _loading = false; });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  void _changeMonth(int delta) {
    setState(() => _month = DateTime(_month.year, _month.month + delta));
    _load();
  }

  // Only the device's current position is used — no manual pin-drop — so a
  // partner can trust a log's location reflects where it was actually
  // submitted from.
  Future<Position> _getCurrentLocation() async {
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
      throw Exception('Location permission denied');
    }
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw Exception('Please turn on location services');
    }
    return Geolocator.getCurrentPosition();
  }

  Future<void> _submit() async {
    if (_notesCtrl.text.trim().isEmpty) return;
    setState(() => _submitting = true);
    try {
      final pos = await _getCurrentLocation();
      final dateStr = '${_date.year}-${_date.month.toString().padLeft(2, '0')}-${_date.day.toString().padLeft(2, '0')}';
      await _service.submitMyDailyLog(
        date: dateStr,
        notes: _notesCtrl.text.trim(),
        latitude: pos.latitude,
        longitude: pos.longitude,
      );
      _notesCtrl.clear();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Log saved')));
      }
      _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Could not save log: ${e.toString().replaceFirst('Exception: ', '')}')));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('My Daily Log', style: TextStyle(color: _ink, fontWeight: FontWeight.w600)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(border: Border.all(color: Colors.grey.shade200), borderRadius: BorderRadius.circular(12)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                InkWell(
                  onTap: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: _date,
                      firstDate: DateTime(2020),
                      lastDate: DateTime.now(),
                    );
                    if (picked != null) setState(() => _date = picked);
                  },
                  child: InputDecorator(
                    decoration: const InputDecoration(labelText: 'Date'),
                    child: Text('${_date.day}/${_date.month}/${_date.year}'),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _notesCtrl,
                  maxLines: 5,
                  decoration: const InputDecoration(labelText: 'What did you do today?', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _submitting ? null : _submit,
                    style: ElevatedButton.styleFrom(backgroundColor: _teal, foregroundColor: Colors.white),
                    child: _submitting
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('Save Log'),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Past Logs', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
              Row(
                children: [
                  IconButton(icon: const Icon(Icons.chevron_left), onPressed: () => _changeMonth(-1)),
                  Text('${_months[_month.month - 1]} ${_month.year}', style: const TextStyle(fontSize: 12.5)),
                  IconButton(icon: const Icon(Icons.chevron_right), onPressed: () => _changeMonth(1)),
                ],
              ),
            ],
          ),
          if (_loading)
            const Padding(padding: EdgeInsets.symmetric(vertical: 20), child: Center(child: CircularProgressIndicator(color: _teal)))
          else if (_logs.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text('No logs for ${_months[_month.month - 1]} ${_month.year}.', style: TextStyle(color: Colors.grey.shade400, fontSize: 13)),
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
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.location_on, size: 12, color: _teal),
                                const SizedBox(width: 2),
                                Text('Located', style: TextStyle(fontSize: 11, color: _teal)),
                              ],
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
    );
  }
}
