import '../config/api.dart';
import '../models/meeting.dart';

class MeetingService {
  final _dio = createDio();

  Future<List<Meeting>> getMeetings({String? doctorId}) async {
    final res = await _dio.get('/meetings', queryParameters: {
      if (doctorId != null) 'doctor_id': doctorId,
    });
    return (res.data as List<dynamic>).map((e) => Meeting.fromJson(e)).toList();
  }

  // Either doctorId or title must be provided — a meeting is identified by
  // one or the other (staff scheduling a general meeting has no doctor).
  Future<void> createMeeting({
    String? doctorId,
    String? title,
    required DateTime scheduledAt,
    String? notes,
    String? mom,
  }) async {
    await _dio.post('/meetings', data: {
      if (doctorId != null) 'doctor_id': doctorId,
      if (title != null) 'title': title,
      'scheduled_at': scheduledAt.toUtc().toIso8601String(),
      if (notes != null) 'notes': notes,
      if (mom != null) 'mom': mom,
    });
  }

  Future<void> updateMeetingStatus(String id, String status) async {
    await _dio.put('/meetings/$id/status', data: {'status': status});
  }

  Future<void> updateMeetingMom(String id, String? mom) async {
    await _dio.put('/meetings/$id/mom', data: {'mom': mom});
  }
}
