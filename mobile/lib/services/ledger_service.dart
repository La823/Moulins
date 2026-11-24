import '../config/api.dart';

class MargBalance {
  final double? balance;
  final DateTime? syncedAt;

  MargBalance({this.balance, this.syncedAt});

  factory MargBalance.fromJson(Map<String, dynamic> json) {
    return MargBalance(
      balance: (json['balance'] as num?)?.toDouble(),
      syncedAt: json['synced_at'] != null ? DateTime.tryParse(json['synced_at']) : null,
    );
  }
}

// The dashboard's "Expected payment" figure, worked out by the server
// (GET /profile/expected-payment). amount null: nothing to show yet.
class ExpectedPayment {
  final double? amount;
  final DateTime? dueDate;
  final String? note;

  ExpectedPayment({this.amount, this.dueDate, this.note});

  factory ExpectedPayment.fromJson(Map<String, dynamic> json) => ExpectedPayment(
        amount: (json['amount'] as num?)?.toDouble(),
        dueDate: json['due_date'] != null ? DateTime.tryParse(json['due_date'].toString()) : null,
        note: (json['note'] as String?)?.trim().isEmpty == true ? null : json['note'] as String?,
      );
}

class LedgerService {
  Future<ExpectedPayment> getExpectedPayment() async {
    final res = await _dio.get('/profile/expected-payment');
    return ExpectedPayment.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  final _dio = createDio();

  Future<String?> getLedgerUrl() async {
    final res = await _dio.get('/ledger');
    if (res.data == null) return null;
    return res.data['file_url'] as String?;
  }

  // The partner's outstanding balance, synced daily from the Marg ERP
  // system (margmaster_party.balance) via the partner's linked rid.
  Future<MargBalance> getBalance() async {
    final res = await _dio.get('/profile/balance');
    return MargBalance.fromJson(res.data);
  }
}
