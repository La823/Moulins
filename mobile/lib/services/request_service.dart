import '../config/api.dart';
import '../models/request.dart';

class RequestService {
  final _dio = createDio();

  Future<List<RequestItem>> getRequests() async {
    final res = await _dio.get('/requests');
    return (res.data as List<dynamic>).map((e) => RequestItem.fromJson(e)).toList();
  }

  Future<void> createRequest(String description) async {
    await _dio.post('/requests', data: {'description': description});
  }
}
