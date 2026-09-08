class TeamMember {
  final String id;
  final String phoneNumber;
  final String? username;
  final String? plainPassword;
  final String? email;

  TeamMember({required this.id, required this.phoneNumber, this.username, this.plainPassword, this.email});

  String get displayName => username ?? phoneNumber;

  factory TeamMember.fromJson(Map<String, dynamic> json) => TeamMember(
        id: json['id'] ?? '',
        phoneNumber: json['phone_number'] ?? '',
        username: json['username'],
        plainPassword: json['plain_password'],
        email: json['email'],
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

// TeamDailyLog is a daily log annotated with whose it is — used for the
// partner's team-wide logs view (as opposed to DailyLog, which is scoped to
// one member's own history).
class TeamDailyLog {
  final String id;
  final String memberName;
  final String date;
  final String notes;
  final double? latitude;
  final double? longitude;
  final String? address;

  TeamDailyLog({
    required this.id,
    required this.memberName,
    required this.date,
    required this.notes,
    this.latitude,
    this.longitude,
    this.address,
  });

  factory TeamDailyLog.fromJson(Map<String, dynamic> json) => TeamDailyLog(
        id: json['id'] ?? '',
        memberName: json['member_name'] ?? '',
        date: json['date'] ?? '',
        notes: json['notes'] ?? '',
        latitude: (json['latitude'] as num?)?.toDouble(),
        longitude: (json['longitude'] as num?)?.toDouble(),
        address: json['address'],
      );
}

class DailyLog {
  final String id;
  final String date;
  final String notes;
  final double? latitude;
  final double? longitude;
  final String? address;

  DailyLog({
    required this.id,
    required this.date,
    required this.notes,
    this.latitude,
    this.longitude,
    this.address,
  });

  factory DailyLog.fromJson(Map<String, dynamic> json) => DailyLog(
        id: json['id'] ?? '',
        date: json['date'] ?? '',
        notes: json['notes'] ?? '',
        latitude: (json['latitude'] as num?)?.toDouble(),
        longitude: (json['longitude'] as num?)?.toDouble(),
        address: json['address'],
      );
}
