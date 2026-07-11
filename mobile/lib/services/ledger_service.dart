import '../config/api.dart';

class LedgerService {
  final _dio = createDio();

  Future<String?> getLedgerUrl() async {
    final res = await _dio.get('/ledger');
    if (res.data == null) return null;
    return res.data['file_url'] as String?;
  }
}
