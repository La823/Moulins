class TeamMember {
  final String id;
  final String phoneNumber;
  final String? username;

  TeamMember({required this.id, required this.phoneNumber, this.username});

  String get displayName => username ?? phoneNumber;

  factory TeamMember.fromJson(Map<String, dynamic> json) => TeamMember(
        id: json['id'] ?? '',
        phoneNumber: json['phone_number'] ?? '',
        username: json['username'],
      );
}

class AttendanceRecord {
  final String id;
  final String employeeId;
  final String employeeName;
  final String date;
  final String checkInTime;
  final String status;
  final String? description;

  AttendanceRecord({
    required this.id,
    required this.employeeId,
    required this.employeeName,
    required this.date,
    required this.checkInTime,
    required this.status,
    this.description,
  });

  factory AttendanceRecord.fromJson(Map<String, dynamic> json) => AttendanceRecord(
        id: json['id'] ?? '',
        employeeId: json['employee_id'] ?? '',
        employeeName: json['employee_name'] ?? '',
        date: json['date'] ?? '',
        checkInTime: json['check_in_time'] ?? '',
        status: json['status'] ?? 'present',
        description: json['description'],
      );
}

class DailyLog {
  final String id;
  final String date;
  final String notes;

  DailyLog({required this.id, required this.date, required this.notes});

  factory DailyLog.fromJson(Map<String, dynamic> json) => DailyLog(
        id: json['id'] ?? '',
        date: json['date'] ?? '',
        notes: json['notes'] ?? '',
      );
}
