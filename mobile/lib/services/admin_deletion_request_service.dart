import '../config/api.dart';

class AdminDeletionRequest {
  final String id;
  final String userName;
  final String userPhone;
  final String userRole;
  final String? reason;
  final String requestedAt;

  AdminDeletionRequest({
    required this.id,
    required this.userName,
    required this.userPhone,
    required this.userRole,
    this.reason,
    required this.requestedAt,
  });

  factory AdminDeletionRequest.fromJson(Map<String, dynamic> json) => AdminDeletionRequest(
        id: json['id'] ?? '',
        userName: json['user_name'] ?? '',
        userPhone: json['user_phone'] ?? '',
        userRole: json['user_role'] ?? '',
        reason: json['reason'],
        requestedAt: json['requested_at'] ?? '',
      );
}

class AdminDeletionRequestService {
  final _dio = createDio();

  Future<List<AdminDeletionRequest>> getPending() async {
    final res = await _dio.get('/admin/deletion-requests');
    final list = res.data['requests'] as List<dynamic>? ?? [];
    return list.map((e) => AdminDeletionRequest.fromJson(e)).toList();
  }

  Future<void> approve(String id) async {
    await _dio.put('/admin/deletion-requests/$id/approve');
  }

  Future<void> reject(String id, {String? notes}) async {
    await _dio.put('/admin/deletion-requests/$id/reject', data: {'notes': notes ?? ''});
  }
}
