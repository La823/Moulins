import '../config/api.dart';

/// Missed punches: a staff member logs a check-in or check-out they forgot
/// to punch on the scanner (date and time); whoever approves leave approves
/// or rejects it. A log only. Server: internal/etimeoffice/missed_punch.go.

class MissedPunch {
  final int id;
  final String empCode;
  final String name;
  final String date; // YYYY-MM-DD
  final String type; // in | out
  final String time; // HH:MM
  final String status; // pending | approved | rejected | cancelled
  final String? decidedByName;
  final DateTime? decidedAt;
  final DateTime? createdAt;

  MissedPunch({
    required this.id,
    required this.empCode,
    required this.name,
    required this.date,
    required this.type,
    required this.time,
    required this.status,
    this.decidedByName,
    this.decidedAt,
    this.createdAt,
  });

  factory MissedPunch.fromJson(Map<String, dynamic> j) => MissedPunch(
        id: j['id'] ?? 0,
        empCode: j['emp_code'] ?? '',
        name: j['name'] ?? '',
        date: j['date'] ?? '',
        type: j['type'] ?? 'in',
        time: j['time'] ?? '',
        status: j['status'] ?? 'pending',
        decidedByName: j['decided_by_name'],
        decidedAt: j['decided_at'] != null ? DateTime.tryParse(j['decided_at'])?.toLocal() : null,
        createdAt: j['created_at'] != null ? DateTime.tryParse(j['created_at'])?.toLocal() : null,
      );

  String get kind => type == 'out' ? 'Check-out' : 'Check-in';
}

class MyMissedPunches {
  final bool linked;
  final String today;
  final List<MissedPunch> items;
  MyMissedPunches({required this.linked, required this.today, required this.items});
}

class MissedPunchService {
  final _dio = createDio();

  Future<MyMissedPunches> mine() async {
    final d = (await _dio.get('/etime/me/missed-punches')).data as Map<String, dynamic>;
    return MyMissedPunches(
      linked: d['linked'] == true,
      today: d['today'] ?? '',
      items: ((d['missed_punches'] as List?) ?? []).map((e) => MissedPunch.fromJson(e)).toList(),
    );
  }

  Future<void> log({required String date, required String type, required String time}) async =>
      _dio.post('/etime/me/missed-punches', data: {'date': date, 'type': type, 'time': time});

  Future<void> withdraw(int id) async => _dio.post('/etime/me/missed-punches/$id/cancel');

  // approvers (leaves_view / leaves_edit)
  Future<(List<MissedPunch>, int)> all({String status = 'pending'}) async {
    final d = (await _dio.get('/admin/etime/missed-punches', queryParameters: {if (status.isNotEmpty) 'status': status})).data
        as Map<String, dynamic>;
    final list = ((d['missed_punches'] as List?) ?? []).map((e) => MissedPunch.fromJson(e)).toList();
    return (list, (d['pending'] ?? 0) as int);
  }

  Future<void> decide(int id, {required bool approve}) async =>
      _dio.post('/admin/etime/missed-punches/$id/${approve ? 'approve' : 'reject'}');
}
