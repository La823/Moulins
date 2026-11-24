import 'dart:io';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter/painting.dart' show Color;
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import '../config/api.dart';

/// Staff tools in the app (mostly MPPL Team): Marg stock, the staff member's
/// own scanner attendance and leave, leave approvals, freight bills, and the
/// packing rotation. Server: internal/margede (stock), internal/etimeoffice
/// (attendance, leave), internal/dispatch (freight bills, rotation).

DateTime? _date(dynamic v) => v is String && v.isNotEmpty ? DateTime.tryParse(v)?.toLocal() : null;
double _num(dynamic v) => v is num ? v.toDouble() : double.tryParse('${v ?? ''}') ?? 0;

// ------------------------------------------------------------ Marg stock

class StockBatch {
  final String batch;
  final DateTime? expiry;
  final double stock;
  final double? mrp;
  StockBatch.fromJson(Map<String, dynamic> j)
      : batch = j['batch'] ?? '',
        expiry = _date(j['expiry']),
        stock = _num(j['stock']),
        mrp = j['mrp'] == null ? null : _num(j['mrp']);
}

class StockProduct {
  final int pid;
  final String code;
  final String name;
  final String company;
  final String form;
  final String unit;
  final double totalStock;
  final int batchCount;
  final int negativeBatches;
  final double expiredQty;
  final double expiringQty;
  final DateTime? nearestExpiry;
  final List<StockBatch> batches;
  StockProduct.fromJson(Map<String, dynamic> j)
      : pid = (j['product_pid'] as num?)?.toInt() ?? 0,
        code = j['code'] ?? '',
        name = j['name'] ?? '',
        company = j['company_name'] ?? j['company_code'] ?? '',
        form = j['form_name'] ?? '',
        unit = j['unit'] ?? '',
        totalStock = _num(j['total_stock']),
        batchCount = (j['batch_count'] as num?)?.toInt() ?? 0,
        negativeBatches = (j['negative_batches'] as num?)?.toInt() ?? 0,
        expiredQty = _num(j['expired_qty']),
        expiringQty = _num(j['expiring_qty']),
        nearestExpiry = _date(j['nearest_expiry']),
        batches = (j['batches'] as List<dynamic>? ?? []).map((e) => StockBatch.fromJson(e)).toList();
}

class StockPage {
  final List<StockProduct> products;
  final int total;
  final int page;
  final int pageSize;
  StockPage.fromJson(Map<String, dynamic> j)
      : products = (j['products'] as List<dynamic>? ?? []).map((e) => StockProduct.fromJson(e)).toList(),
        total = (j['total'] as num?)?.toInt() ?? 0,
        page = (j['page'] as num?)?.toInt() ?? 1,
        pageSize = (j['page_size'] as num?)?.toInt() ?? 50;
  bool get hasMore => page * pageSize < total;
}

// ------------------------------------------------ attendance and leave

class LeaveBalance {
  final double perMonth;
  final double available;
  final double usedThisMonth;
  final double pendingDays;
  LeaveBalance.fromJson(Map<String, dynamic>? j)
      : perMonth = _num(j?['per_month']),
        available = _num(j?['available']),
        usedThisMonth = _num(j?['used_this_month']),
        pendingDays = _num(j?['pending_days']);
}

class LeaveRequest {
  final int id;
  final String empCode;
  final String name;
  final String fromDate;
  final String toDate;
  final bool halfDay;
  final double days;
  final String reason;
  final String status; // pending, approved, rejected, cancelled
  final String decidedBy;
  final String decisionNote;
  final DateTime? createdAt;
  LeaveRequest.fromJson(Map<String, dynamic> j)
      : id = (j['id'] as num?)?.toInt() ?? 0,
        empCode = j['emp_code'] ?? '',
        name = j['name'] ?? '',
        fromDate = j['from_date'] ?? '',
        toDate = j['to_date'] ?? '',
        halfDay = j['half_day'] == true,
        days = _num(j['days']),
        reason = j['reason'] ?? '',
        status = j['status'] ?? '',
        decidedBy = j['decided_by_name'] ?? '',
        decisionNote = j['decision_note'] ?? '',
        createdAt = _date(j['created_at']);
}

class MyLeave {
  final bool linked; // login linked to a fingerprint-scanner employee
  final String name;
  final LeaveBalance balance;
  final List<LeaveRequest> leaves;
  final String today;
  MyLeave.fromJson(Map<String, dynamic> j)
      : linked = j['linked'] == true,
        name = (j['employee'] as Map?)?['name'] ?? '',
        balance = LeaveBalance.fromJson(j['balance'] as Map<String, dynamic>?),
        leaves = (j['leaves'] as List<dynamic>? ?? []).map((e) => LeaveRequest.fromJson(e)).toList(),
        today = j['today'] ?? '';
}

class AttendanceDay {
  final String date;
  final String state; // present, in, half_day, absent, missed_punch, weekly_off, holiday, leave, upcoming, not_synced, other
  final String inTime;
  final String outTime;
  final int workMinutes;
  final int lateMinutes;
  AttendanceDay.fromJson(Map<String, dynamic> j)
      : date = j['date'] ?? '',
        state = j['state'] ?? '',
        inTime = j['in_time'] ?? '',
        outTime = j['out_time'] ?? '',
        workMinutes = (j['work_minutes'] as num?)?.toInt() ?? 0,
        lateMinutes = (j['late_minutes'] as num?)?.toInt() ?? 0;
}

class AttendanceMonth {
  final String month;
  final List<AttendanceDay> days;
  final double present;
  final int absent;
  final double leave;
  final int late;
  AttendanceMonth.fromJson(Map<String, dynamic> j)
      : month = j['month'] ?? '',
        days = ((j['employees'] as List<dynamic>? ?? []).isEmpty
                ? <dynamic>[]
                : ((j['employees'] as List).first['days'] as List<dynamic>? ?? []))
            .map((e) => AttendanceDay.fromJson(e))
            .toList(),
        present = _num(_totals(j)['present']),
        absent = (_totals(j)['absent'] as num?)?.toInt() ?? 0,
        leave = _num(_totals(j)['leave']),
        late = (_totals(j)['late'] as num?)?.toInt() ?? 0;

  static Map<String, dynamic> _totals(Map<String, dynamic> j) {
    final e = j['employees'] as List<dynamic>? ?? [];
    return e.isEmpty ? {} : (e.first['totals'] as Map<String, dynamic>? ?? {});
  }
}

// ---------------------------------------------------------- freight bills

class FreightBill {
  final String id;
  final String billNo;
  final DateTime? billDate;
  final String transportId;
  final String transporter;
  final double amountPaid;
  final String paymentMode;
  final String paidBy;
  final String remarks;
  final String fileUrl;
  final String fileName;
  final String contentType;
  final String createdBy;
  final String createdById;
  final DateTime? createdAt;
  FreightBill.fromJson(Map<String, dynamic> j)
      : id = j['id'] ?? '',
        billNo = j['bill_no'] ?? '',
        billDate = j['bill_date'] is String ? DateTime.tryParse(j['bill_date']) : null,
        transportId = j['transport_id'] ?? '',
        transporter = j['transporter_name'] ?? '',
        amountPaid = _num(j['amount_paid']),
        paymentMode = j['payment_mode'] ?? '',
        paidBy = j['paid_by'] ?? '',
        remarks = j['remarks'] ?? '',
        fileUrl = j['file_url'] ?? '',
        fileName = j['file_name'] ?? '',
        contentType = j['content_type'] ?? '',
        createdBy = j['created_by'] ?? '',
        createdById = j['created_by_id'] ?? '',
        createdAt = _date(j['created_at']);
  bool get isPdf => contentType.contains('pdf') || fileName.toLowerCase().endsWith('.pdf') || fileUrl.toLowerCase().endsWith('.pdf');
}

class FreightList {
  final List<FreightBill> bills;
  final double total;
  final bool all; // the viewer sees everyone's bills
  FreightList.fromJson(Map<String, dynamic> j)
      : bills = (j['bills'] as List<dynamic>? ?? []).map((e) => FreightBill.fromJson(e)).toList(),
        total = _num(j['total']),
        all = j['all'] == true;
}

const freightPaymentModes = {'cash': 'Cash', 'upi': 'UPI', 'bank': 'Bank transfer', 'cheque': 'Cheque', 'other': 'Other'};

// ---------------------------------------------------------- rotation

class Packer {
  final String id;
  final String name;
  final bool skip;
  final bool linked;
  final bool present;
  final bool onLeave;
  final bool inTurn;
  final int open;
  final String? firstIn; // HH:MM of today's first punch
  final bool halfDayLeave;
  Packer.fromJson(Map<String, dynamic> j)
      : id = j['id'] ?? '',
        name = j['name'] ?? '',
        skip = j['skip'] == true,
        linked = j['linked'] == true,
        present = j['present'] == true,
        onLeave = j['on_leave'] == true,
        inTurn = j['in_turn'] == true,
        open = (j['open'] as num?)?.toInt() ?? 0,
        firstIn = j['first_in'],
        halfDayLeave = j['half_day_leave'] == true;
  String get note => skip ? 'out of rotation' : (onLeave ? 'on leave' : (!present ? 'absent' : ''));

  /// Today's attendance in words, as on the website.
  String get dayText {
    if (onLeave) return 'On leave today';
    if (!linked) return 'Not on the attendance machine';
    final half = halfDayLeave ? ' · half-day leave' : '';
    final t = firstIn;
    if (t != null) {
      final parts = t.split(':');
      final h = int.tryParse(parts[0]) ?? 0;
      return 'Present · in at ${h % 12 == 0 ? 12 : h % 12}:${parts.length > 1 ? parts[1] : '00'} ${h < 12 ? 'AM' : 'PM'}$half';
    }
    return 'Not punched in yet$half';
  }

  Color get dayColor => onLeave
      ? const Color(0xFFDC2626)
      : !linked
          ? const Color(0xFF6B7280)
          : firstIn != null
              ? const Color(0xFF15803D)
              : const Color(0xFFB45309);
}

// ------------------------------------------------------------ Marg bills

String? _s(dynamic v) => v is String && v.trim().isNotEmpty ? v.trim() : null;

/// One bill in the list (GET /admin/marg-bills). Type: S sale invoice, CH
/// sale challan, P purchase, R/B/D/T/u other vouchers, named by typeName.
class MargBill {
  final int voucher;
  final String billNo;
  final String type;
  final String typeName;
  final DateTime? date;
  final String party;
  final String partyCode;
  final double total;
  final int lines;
  final bool cancelled;
  final String? orderRefs;
  MargBill.fromJson(Map<String, dynamic> j)
      : voucher = (j['voucher'] as num?)?.toInt() ?? 0,
        billNo = j['bill_no'] ?? '',
        type = j['bill_type'] ?? '',
        typeName = _s(j['bill_type_name']) ?? (j['bill_type'] ?? ''),
        date = _date(j['bill_date']),
        party = _s(j['party_name']) ?? (_s(j['party_code']) ?? ''),
        partyCode = j['party_code'] ?? '',
        total = _num(j['total']),
        lines = (j['lines_count'] as num?)?.toInt() ?? 0,
        cancelled = j['is_cancelled'] == true,
        orderRefs = _s(j['order_refs']);
}

/// A voucher type with its count under the current search (the type chips).
class MargBillType {
  final String code;
  final String name;
  final int count;
  MargBillType.fromJson(Map<String, dynamic> j)
      : code = j['code'] ?? '',
        name = _s(j['name']) ?? (j['code'] ?? ''),
        count = (j['count'] as num?)?.toInt() ?? 0;
}

class MargBillPage {
  final List<MargBill> bills;
  final List<MargBillType> types;
  final int total;
  final int page;
  final int pageSize;
  final double sumTotal; // cancelled bills left out
  MargBillPage.fromJson(Map<String, dynamic> j)
      : bills = [for (final b in (j['bills'] as List? ?? [])) MargBill.fromJson(Map<String, dynamic>.from(b))],
        types = [for (final t in (j['types'] as List? ?? [])) MargBillType.fromJson(Map<String, dynamic>.from(t))],
        total = (j['total'] as num?)?.toInt() ?? 0,
        page = (j['page'] as num?)?.toInt() ?? 1,
        pageSize = (j['page_size'] as num?)?.toInt() ?? 50,
        sumTotal = _num(j['sum_total']);
  bool get hasMore => page * pageSize < total;
}

class MargBillLine {
  final String kind; // item | charge
  final String product;
  final String? batch;
  final DateTime? expiry;
  final double qty;
  final double free;
  final double? mrp;
  final double? rate;
  final double discount;
  final double gstPercent;
  final double gstAmount;
  final double lineTotal;
  MargBillLine.fromJson(Map<String, dynamic> j)
      : kind = j['line_kind'] ?? 'item',
        product = _s(j['product_name']) ?? 'Product ${j['product_pid'] ?? ''}',
        batch = _s(j['batch']),
        expiry = _date(j['expiry']),
        qty = _num(j['qty']),
        free = _num(j['free']),
        mrp = j['mrp'] == null ? null : _num(j['mrp']),
        rate = j['rate'] == null ? null : _num(j['rate']),
        discount = _num(j['discount']),
        gstPercent = _num(j['gst_percent']),
        gstAmount = _num(j['gst_amount']),
        lineTotal = _num(j['line_total']);
}

/// One bill with its lines (GET /admin/marg-bills/{voucher}).
class MargBillDetail {
  final MargBill bill;
  final String? salesman;
  final String? area;
  final List<String> fromChallans;
  final List<MargBillLine> lines;
  MargBillDetail.fromJson(Map<String, dynamic> j)
      : bill = MargBill.fromJson(j),
        salesman = _s(j['salesman']),
        area = _s(j['area']),
        fromChallans = [for (final c in (j['from_challans'] as List? ?? [])) '$c'],
        lines = [for (final l in (j['items'] as List? ?? [])) MargBillLine.fromJson(Map<String, dynamic>.from(l))];
}

class StaffService {
  final _dio = createDio();

  // view 'low' = needs ordering (the website's Demand & reorder rule);
  // expiryMonths keeps products with stock expiring within that many months
  Future<StockPage> stock({String search = '', String view = '', int? expiryMonths, int page = 1}) async {
    final res = await _dio.get('/admin/marg-stock', queryParameters: {
      if (search.isNotEmpty) 'search': search,
      if (view.isNotEmpty) 'view': view,
      if (expiryMonths != null) 'expiry_months': expiryMonths,
      'page': page,
    });
    return StockPage.fromJson(res.data);
  }

  /// Marg bills, newest first. type: a voucher type code ('' = all).
  Future<MargBillPage> margBills({String search = '', String type = '', int page = 1}) async {
    final res = await _dio.get('/admin/marg-bills', queryParameters: {
      if (search.isNotEmpty) 'search': search,
      if (type.isNotEmpty) 'type': type,
      'page': page,
    });
    return MargBillPage.fromJson(Map<String, dynamic>.from(res.data));
  }

  /// A printable PDF of a Marg bill (the same as the website's PDF button),
  /// downloaded with the login token; open it with OpenFilex.
  Future<File> margBillPdf(int voucher) async {
    final token = await getToken();
    final info = await DefaultCacheManager().downloadFile('$baseUrl/admin/marg-bills/$voucher/pdf',
        key: 'marg-bill-pdf-$voucher', authHeaders: {'Authorization': 'Bearer $token'}, force: true);
    return info.file;
  }

  Future<MargBillDetail> margBill(int voucher) async =>
      MargBillDetail.fromJson(Map<String, dynamic>.from((await _dio.get('/admin/marg-bills/$voucher')).data));

  Future<MyLeave> myLeave() async => MyLeave.fromJson((await _dio.get('/etime/me')).data);

  Future<AttendanceMonth> myMonth(String month) async =>
      AttendanceMonth.fromJson((await _dio.get('/etime/me/month', queryParameters: {'month': month})).data);

  Future<void> applyLeave({required String from, required String to, required bool halfDay, required String reason}) async =>
      _dio.post('/etime/me/leaves', data: {'from': from, 'to': to, 'half_day': halfDay, 'reason': reason});

  Future<void> cancelMyLeave(int id) async => _dio.post('/etime/me/leaves/$id/cancel');

  /// Every staff leave request (leaves_view); status '' = all.
  Future<(List<LeaveRequest>, int)> leaves({String status = ''}) async {
    final res = await _dio.get('/admin/etime/leaves', queryParameters: {if (status.isNotEmpty) 'status': status});
    final list = (res.data['leaves'] as List<dynamic>? ?? []).map((e) => LeaveRequest.fromJson(e)).toList();
    return (list, (res.data['pending_count'] as num?)?.toInt() ?? 0);
  }

  Future<void> approveLeave(int id, {String note = ''}) async =>
      _dio.post('/admin/etime/leaves/$id/approve', data: {'paid': 'auto', 'note': note});

  Future<void> rejectLeave(int id, {String note = ''}) async => _dio.post('/admin/etime/leaves/$id/reject', data: {'note': note});

  Future<FreightList> freightBills({String from = '', String to = '', String q = ''}) async {
    final res = await _dio.get('/admin/freight-bills', queryParameters: {
      if (from.isNotEmpty) 'from': from,
      if (to.isNotEmpty) 'to': to,
      if (q.isNotEmpty) 'q': q,
    });
    return FreightList.fromJson(res.data);
  }

  /// Uploads a bill's photo or PDF; returns its key for [saveFreightBill].
  Future<String> uploadFreightFile(Uint8List bytes, String filename, String contentType) async {
    final res = await _dio.post('/admin/freight-bills/upload-url', data: {'filename': filename});
    await Dio().put(res.data['upload_url'] as String,
        data: Stream.fromIterable([bytes]),
        options: Options(headers: {'Content-Type': contentType, Headers.contentLengthHeader: bytes.length}));
    return res.data['key'] as String;
  }

  /// Creates a bill, or changes it when [id] is given (an empty fileKey keeps its file).
  Future<void> saveFreightBill({String? id, required Map<String, dynamic> data}) async {
    if (id == null) {
      await _dio.post('/admin/freight-bills', data: data);
    } else {
      await _dio.put('/admin/freight-bills/$id', data: data);
    }
  }

  Future<void> deleteFreightBill(String id) async => _dio.delete('/admin/freight-bills/$id');

  Future<List<Map<String, dynamic>>> transports() async {
    final res = await _dio.get('/transports');
    final list = res.data is List ? res.data as List : (res.data['transports'] as List<dynamic>? ?? []);
    return list.cast<Map<String, dynamic>>();
  }

  Future<List<Packer>> packers() async {
    final res = await _dio.get('/admin/dispatch/packers');
    return (res.data['packers'] as List<dynamic>? ?? []).map((e) => Packer.fromJson(e)).toList();
  }

  Future<void> assignPacker(String orderId, String userId) async =>
      _dio.put('/admin/orders/$orderId/packing-assignee', data: {'user_id': userId});
}

/// "Something went wrong" with the server's own message when it sent one.
String staffError(Object e) {
  if (e is DioException) {
    final d = e.response?.data;
    if (d is String && d.trim().isNotEmpty && d.length < 300) return d.trim();
    if (e.type == DioExceptionType.connectionError || e.type == DioExceptionType.connectionTimeout) {
      return 'No connection. Check the internet and try again.';
    }
  }
  return 'Something went wrong. Please try again.';
}
