import '../config/api.dart';
import '../models/meeting.dart';

class MeetingService {
  final _dio = createDio();

  Future<List<Meeting>> getMeetings() async {
    final res = await _dio.get('/meetings');
    return (res.data as List<dynamic>).map((e) => Meeting.fromJson(e)).toList();
  }

  Future<void> createMeeting({
    required String doctorId,
    required DateTime scheduledAt,
    String? notes,
    String? mom,
  }) async {
    await _dio.post('/meetings', data: {
      'doctor_id': doctorId,
      'scheduled_at': scheduledAt.toIso8601String(),
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
