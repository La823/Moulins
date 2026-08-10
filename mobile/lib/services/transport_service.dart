import '../config/api.dart';
import '../models/transport.dart';
import '../models/transport_mode.dart';

class TransportService {
  final _dio = createDio();

  Future<List<TransportMode>> getModes() async {
    final res = await _dio.get('/transport-modes');
    final data = res.data;
    if (data is List) return data.map((e) => TransportMode.fromJson(e)).toList();
    return [];
  }

  Future<void> createMode(String name) async {
    await _dio.post('/admin/transport-modes', data: {'name': name});
  }

  Future<void> deleteMode(String id) async {
    await _dio.delete('/admin/transport-modes/$id');
  }

  Future<List<Transport>> getTransports({String? mode}) async {
    final res = await _dio.get('/transports', queryParameters: {
      if (mode != null && mode.isNotEmpty) 'mode': mode,
    });
    final data = res.data;
    if (data is List) return data.map((e) => Transport.fromJson(e)).toList();
    return [];
  }

  // Staff (admin/employee with the "orders" permission) — manage the list.
  Future<void> createTransport({required String mode, required String name, String? gstNumber}) async {
    await _dio.post('/admin/transports', data: {'mode': mode, 'name': name, 'gst_number': gstNumber});
  }

  Future<void> updateTransport(String id, {required String name, String? gstNumber}) async {
    await _dio.put('/admin/transports/$id', data: {'name': name, 'gst_number': gstNumber});
  }

  Future<void> deleteTransport(String id) async {
    await _dio.delete('/admin/transports/$id');
  }
}
