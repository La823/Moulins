import '../config/api.dart';

class DeletionRequest {
  final String id;
  final String status;
  final String? reason;
  final String? adminNotes;
  final String requestedAt;

  DeletionRequest({
    required this.id,
    required this.status,
    this.reason,
    this.adminNotes,
    required this.requestedAt,
  });

  factory DeletionRequest.fromJson(Map<String, dynamic> json) => DeletionRequest(
        id: json['id'] ?? '',
        status: json['status'] ?? '',
        reason: json['reason'],
        adminNotes: json['admin_notes'],
        requestedAt: json['requested_at'] ?? '',
      );
}

class AccountDeletionService {
  final _dio = createDio();

  Future<DeletionRequest?> getMyRequest() async {
    final res = await _dio.get('/account/deletion-request');
    if (res.data == null) return null;
    return DeletionRequest.fromJson(res.data);
  }

  Future<void> submitRequest({String? reason}) async {
    await _dio.post('/account/deletion-request', data: {if (reason != null && reason.isNotEmpty) 'reason': reason});
  }

  Future<void> cancelRequest() async {
    await _dio.delete('/account/deletion-request');
  }
}
