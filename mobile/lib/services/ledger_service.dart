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

class LedgerService {
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
