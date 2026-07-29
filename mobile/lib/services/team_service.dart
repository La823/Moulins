import '../config/api.dart';
import '../models/team_member.dart';

class TeamService {
  final _dio = createDio();

  Future<List<TeamMember>> getTeamMembers() async {
    final res = await _dio.get('/team');
    return (res.data as List<dynamic>).map((e) => TeamMember.fromJson(e)).toList();
  }

  Future<void> createTeamMember({required String phoneNumber, required String password, String? username}) async {
    await _dio.post('/team', data: {
      'phone_number': phoneNumber,
      'password': password,
      if (username != null && username.isNotEmpty) 'username': username,
    });
  }

  Future<void> deleteTeamMember(String id) async {
    await _dio.delete('/team/$id');
  }

  Future<void> updateTeamMemberPassword(String id, String password) async {
    await _dio.put('/team/$id', data: {'password': password});
  }

  // Attendance — partner marking/viewing their team.
  Future<List<AttendanceRecord>> getTeamAttendanceByDate(String date) async {
    final res = await _dio.get('/team/attendance', queryParameters: {'date': date});
    return (res.data as List<dynamic>).map((e) => AttendanceRecord.fromJson(e)).toList();
  }

  Future<List<AttendanceRecord>> getMemberAttendanceByMonth(String memberId, int year, int month) async {
    final res = await _dio.get('/team/$memberId/attendance/month', queryParameters: {'year': year, 'month': month});
    return (res.data as List<dynamic>).map((e) => AttendanceRecord.fromJson(e)).toList();
  }

  Future<void> markAttendance({
    required String employeeId,
    required String date,
    required String checkInTime,
    required String status,
    String? description,
  }) async {
    await _dio.post('/team/attendance', data: {
      'employee_id': employeeId,
      'date': date,
      'check_in_time': checkInTime,
      'status': status,
      'description': description,
    });
  }

  Future<void> deleteAttendance(String id) async {
    await _dio.delete('/team/attendance/$id');
  }

  // Daily logs — partner reviewing a member's logs.
  Future<List<DailyLog>> getMemberDailyLogs(String memberId, int year, int month) async {
    final res = await _dio.get('/team/$memberId/daily-logs', queryParameters: {'year': year, 'month': month});
    return (res.data as List<dynamic>).map((e) => DailyLog.fromJson(e)).toList();
  }
}

class SelfService {
  final _dio = createDio();

  // Self-service — a team member viewing their own attendance/logs.
  Future<List<AttendanceRecord>> getMyAttendance(int year, int month) async {
    final res = await _dio.get('/my-attendance', queryParameters: {'year': year, 'month': month});
    return (res.data as List<dynamic>).map((e) => AttendanceRecord.fromJson(e)).toList();
  }

  Future<List<DailyLog>> getMyDailyLogs(int year, int month) async {
    final res = await _dio.get('/my-daily-log', queryParameters: {'year': year, 'month': month});
    return (res.data as List<dynamic>).map((e) => DailyLog.fromJson(e)).toList();
  }

  Future<void> submitMyDailyLog({required String date, required String notes}) async {
    await _dio.post('/my-daily-log', data: {'date': date, 'notes': notes});
  }
}
