import '../config/api.dart';
import 'json_cache.dart';

/// A partner's own invoices from Marg (final sale bills this financial year,
/// with GST), like the website's partner panel Bills page. Remembered on the
/// phone, so they open offline too (json_cache.dart).
class BillsService {
  final _dio = createDio();

  /// {linked, bills: [{voucher, bill_no, date, items, amount, gst, total}], total, count}
  Future<Map<String, dynamic>> myBills() => JsonCache.fetch(
        'my_bills',
        () async => (await _dio.get('/my/marg-bills')).data,
        (data) => Map<String, dynamic>.from(data as Map),
      );

  /// One invoice with its lines: {lines: [{kind, product, batch, expiry, qty,
  /// free, mrp, rate, discount, amount, gst_amount, gst_percent, line_total}]}
  Future<Map<String, dynamic>> myBill(int voucher) => JsonCache.fetch(
        'my_bill_$voucher',
        () async => (await _dio.get('/my/marg-bills/$voucher')).data,
        (data) => Map<String, dynamic>.from(data as Map),
      );
}
