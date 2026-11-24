import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../providers/auth_provider.dart';
import '../../services/bills_service.dart';
import '../../services/ledger_service.dart';
import '../../services/order_service.dart';
import '../../services/doctor_service.dart';
import '../../services/meeting_service.dart';
import '../../services/payment_service.dart';
import '../../services/request_service.dart';
import '../../services/retailer_service.dart';
import '../../services/team_service.dart';
import '../../utils/responsive.dart';
import '../../widgets/app_drawer.dart';
import '../bills/my_bills_screen.dart';
import '../../widgets/shell_leading.dart';

const _teal = Color(0xFF00A6A4);
const _tealDark = Color(0xFF00807E);
const _ink = Color(0xFF1A1A1A);

final _dateFmt = DateFormat('d MMM y, h:mm a');
final _money = NumberFormat('#,##,##0.00', 'en_IN');
final _moneyShort = NumberFormat.compactCurrency(locale: 'en_IN', symbol: '₹', decimalDigits: 1);

// The partner's home: their money with Moulins (Marg balance, what was billed
// this financial year, payments, ledger) in one card, their latest bills, then
// their orders and people as plain list rows. Each row opens its page. A team
// member sees their own work only (orders, doctors, meetings, requests).
// Every figure loads on its own, so one that fails shows a dash instead of
// holding up the rest.
class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});

  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  bool _loading = true;
  bool _isTeamMember = false;

  int? _orders, _ordersOpen;
  int? _doctors;
  int? _meetings, _meetingsUpcoming;
  int? _requests;
  // partner only
  int? _retailers;
  int? _retailerOrders, _retailerOrdersWaiting;
  int? _team, _teamPresent;
  int? _paymentsPending;
  double? _paidVerified;
  Map<String, dynamic>? _bills;
  MargBalance? _balance;
  String? _ledgerUrl;
  ExpectedPayment? _expected;

  @override
  void initState() {
    super.initState();
    _load();
  }

  // one figure: null when it could not be loaded
  Future<T?> _try<T>(Future<T> f) async {
    try {
      return await f;
    } catch (_) {
      return null;
    }
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    _isTeamMember = ref.read(authProvider).user?.role == 'team_member';
    final partner = !_isTeamMember;
    final today = DateFormat('yyyy-MM-dd').format(DateTime.now());

    final orders = _try(OrderService().getMyOrders());
    final doctors = _try(DoctorService().getDoctors());
    final meetings = _try(MeetingService().getMeetings());
    final requests = _try(RequestService().getRequests());
    final retailers = partner ? _try(RetailerService().getRetailers()) : Future.value(null);
    final retailerOrders = partner ? _try(RetailerService().getOrders(incoming: true)) : Future.value(null);
    final team = partner ? _try(TeamService().getTeamMembers()) : Future.value(null);
    final attendance = partner ? _try(TeamService().getTeamAttendanceByDate(today)) : Future.value(null);
    final payments = partner ? _try(PaymentService().getMyPayments()) : Future.value(null);
    final bills = partner ? _try(BillsService().myBills()) : Future.value(null);
    final balance = partner ? _try(LedgerService().getBalance()) : Future.value(null);
    final ledgerUrl = partner ? _try(LedgerService().getLedgerUrl()) : Future.value(null);
    final expected = partner ? _try(LedgerService().getExpectedPayment()) : Future.value(null);

    final o = await orders, d = await doctors, m = await meetings, r = await requests;
    final ret = await retailers, ro = await retailerOrders, t = await team, att = await attendance;
    final pay = await payments, b = await bills, bal = await balance, url = await ledgerUrl;
    final exp = await expected;
    if (!mounted) return;
    setState(() {
      _orders = o?.length;
      _ordersOpen = o?.where((x) => !const {'delivered', 'cancelled', 'refunded'}.contains(x.status)).length;
      _doctors = d?.length;
      _meetings = m?.length;
      _meetingsUpcoming = m?.where((x) => x.status == 'upcoming').length;
      _requests = r?.length;
      _retailers = ret?.length;
      _retailerOrders = ro?.length;
      _retailerOrdersWaiting = ro?.where((x) => x.status == 'pending').length;
      _team = t?.length;
      _teamPresent = att?.where((a) => a.status == 'present').length;
      _paymentsPending = pay?.where((p) => p.status == 'pending').length;
      _paidVerified = pay?.where((p) => p.status == 'verified').fold<double>(0, (s, p) => s + p.amount);
      _bills = b;
      _balance = bal;
      _ledgerUrl = url;
      _expected = exp;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF6F7F8),
      drawer: const AppDrawer(),
      appBar: AppBar(
        leadingWidth: ShellLeading.widthFor(context),
        leading: const ShellLeading(),
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('Dashboard', style: TextStyle(color: _ink, fontWeight: FontWeight.w600)),
      ),
      body: ResponsiveCenter(
        child: RefreshIndicator(
          onRefresh: _load,
          color: _teal,
          child: _loading
              ? const Center(child: Padding(padding: EdgeInsets.all(40), child: CircularProgressIndicator(color: _teal)))
              : ListView(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
                  children: _isTeamMember ? _teamMemberView() : _partnerView(),
                ),
        ),
      ),
    );
  }

  List<Widget> _teamMemberView() => [
        _heading('Your work'),
        _group([
          _row(Icons.shopping_bag_outlined, 'Orders', '/orders', count: _orders, sub: _openSub()),
          _row(Icons.people_outline, 'Doctors', '/doctors', count: _doctors),
          _row(Icons.calendar_today_outlined, 'Meetings', '/meetings', count: _meetings, sub: _upcomingSub()),
          _row(Icons.assignment_outlined, 'Requests', '/requests', count: _requests),
        ]),
      ];

  List<Widget> _partnerView() {
    final waiting = _retailerOrdersWaiting ?? 0;
    return [
      _accountCard(),
      const SizedBox(height: 12),
      _expectedPaymentBox(),
      _heading('Recent bills', action: 'See all', route: '/my-bills'),
      _recentBills(),
      _heading('Orders'),
      _group([
        _row(Icons.shopping_bag_outlined, 'My orders', '/orders', count: _orders, sub: _openSub()),
        _row(
          Icons.move_to_inbox_outlined,
          'Retailer orders',
          '/retailer-orders',
          count: _retailerOrders,
          sub: waiting > 0 ? null : (_retailerOrdersWaiting == null ? null : 'None waiting'),
          badge: waiting > 0 ? '$waiting waiting' : null,
        ),
      ]),
      _heading('Your people'),
      _group([
        _row(Icons.storefront_outlined, 'Retailers', '/retailers', count: _retailers),
        _row(Icons.people_outline, 'Doctors', '/doctors', count: _doctors),
        _row(
          Icons.groups_outlined,
          'Team',
          '/team',
          count: _team,
          sub: _team != null && _team! > 0 && _teamPresent != null ? '$_teamPresent present today' : null,
        ),
        _row(Icons.event_available_outlined, 'Team attendance', '/team-attendance', sub: 'Mark and see who came in'),
        _row(Icons.calendar_today_outlined, 'Meetings', '/meetings', count: _meetings, sub: _upcomingSub()),
        _row(Icons.assignment_outlined, 'Requests', '/requests', count: _requests),
      ]),
    ];
  }

  // ---- sub-lines ----

  String? _openSub() => _ordersOpen == null ? null : '$_ordersOpen in progress';
  String? _upcomingSub() => _meetingsUpcoming == null ? null : '$_meetingsUpcoming upcoming';

  String _rsShort(dynamic v) {
    final d = (v as num?)?.toDouble() ?? 0;
    return d.abs() >= 100000 ? _moneyShort.format(d) : '₹${NumberFormat('#,##,##0', 'en_IN').format(d)}';
  }

  // ---- the account card: balance, then billed / paid, ledger ----

  // The number that matters most here: the partner's live outstanding
  // balance with Moulins, synced daily from Marg. Billed this year and
  // payments sit under it in the same card, each opening its page.
  Widget _accountCard() {
    final balance = _balance?.balance;
    final linked = _bills?['linked'] == true;
    final pending = _paymentsPending ?? 0;
    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [_teal, _tealDark], begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(18),
        boxShadow: [BoxShadow(color: _teal.withValues(alpha: 0.25), blurRadius: 16, offset: const Offset(0, 6))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 18, 12, 16),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Current balance', style: TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.w500)),
                const SizedBox(height: 6),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    balance != null ? '₹${_money.format(balance)}' : 'Not available',
                    style: const TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.w700, letterSpacing: -0.5),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  _balance?.syncedAt != null
                      ? 'As of ${_dateFmt.format(_balance!.syncedAt!.toLocal())}'
                      : balance == null
                          ? 'Your account isn\'t linked to Marg yet, or hasn\'t synced.'
                          : '',
                  style: const TextStyle(color: Colors.white70, fontSize: 12),
                ),
              ]),
            ),
            if (_ledgerUrl != null)
              TextButton.icon(
                onPressed: () => launchUrl(Uri.parse(_ledgerUrl!), mode: LaunchMode.externalApplication),
                style: TextButton.styleFrom(
                  foregroundColor: Colors.white,
                  backgroundColor: Colors.white.withValues(alpha: 0.16),
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  visualDensity: VisualDensity.compact,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                ),
                icon: const Icon(Icons.description_outlined, size: 16),
                label: const Text('Ledger', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
              ),
          ]),
        ),
        Container(height: 1, color: Colors.white.withValues(alpha: 0.18)),
        IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Expanded(
              child: _accountFigure(
                'Billed this year',
                linked ? _rsShort(_bills?['total']) : '—',
                linked ? _billsSub() : 'Not linked to billing yet',
                '/my-bills',
                left: true,
              ),
            ),
            Container(width: 1, color: Colors.white.withValues(alpha: 0.18)),
            Expanded(
              child: _accountFigure(
                'Payments',
                _paidVerified == null ? '—' : _rsShort(_paidVerified),
                _paymentsPending == null ? '' : pending > 0 ? '$pending waiting to be checked' : 'Verified',
                '/payments',
                alert: pending > 0,
              ),
            ),
          ]),
        ),
      ]),
    );
  }

  Widget _accountFigure(String label, String value, String sub, String route, {bool left = false, bool alert = false}) =>
      InkWell(
        onTap: () => context.push(route),
        borderRadius: BorderRadius.only(
          bottomLeft: left ? const Radius.circular(18) : Radius.zero,
          bottomRight: left ? Radius.zero : const Radius.circular(18),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 12, 14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: const TextStyle(color: Colors.white70, fontSize: 12)),
            const SizedBox(height: 2),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(value, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700)),
            ),
            if (sub.isNotEmpty)
              Text(sub,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: alert ? const Color(0xFFFFE0A3) : Colors.white70,
                    fontSize: 11.5,
                    fontWeight: alert ? FontWeight.w600 : null,
                  )),
          ]),
        ),
      );

  // ---- expected payment: a figure the server works out ----
  // Shows a dash until the server sends an amount (also on an older server
  // without this figure), so it is safe to ship before it is calculated.
  Widget _expectedPaymentBox() {
    final e = _expected;
    final amount = e?.amount;
    final sub = amount == null
        ? 'Not available yet'
        : [
            if (e!.dueDate != null) 'Due ${DateFormat('d MMM y').format(e.dueDate!.toLocal())}',
            if (e.note != null) e.note!,
          ].join(' · ');
    return _group([
      Padding(
        padding: const EdgeInsets.fromLTRB(14, 14, 16, 14),
        child: Row(children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(color: _teal.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(10)),
            child: const Icon(Icons.schedule_outlined, color: _tealDark, size: 19),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Expected payment', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: _ink)),
              if (sub.isNotEmpty) ...[
                const SizedBox(height: 1),
                Text(sub, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
              ],
            ]),
          ),
          Text(
            amount == null ? '—' : '₹${_money.format(amount)}',
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: amount == null ? Colors.grey.shade400 : _ink),
          ),
        ]),
      ),
    ]);
  }

  String _billsSub() {
    final count = _bills?['count'] ?? 0;
    return '$count invoice${count == 1 ? '' : 's'}';
  }

  // ---- recent bills: the latest few invoices in one card ----

  Widget _recentBills() {
    if (_bills == null) return _group([_note('Your bills could not be loaded. Pull down to try again.')]);
    if (_bills!['linked'] != true) {
      return _group([_note('Your bills will show here once your account is linked to our billing.')]);
    }
    final bills = (_bills!['bills'] as List? ?? []).cast<Map>().toList()
      ..sort((a, b) => (b['date']?.toString() ?? '').compareTo(a['date']?.toString() ?? ''));
    if (bills.isEmpty) return _group([_note('No invoices this financial year yet.')]);
    return _group([
      for (final b in bills.take(4))
        InkWell(
          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => BillDetailScreen(bill: b))),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
            child: Row(children: [
              _dateChip(DateTime.tryParse(b['date']?.toString() ?? '')),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Invoice ${b['bill_no'] ?? ''}', style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: _ink)),
                  const SizedBox(height: 2),
                  Text('${b['items'] ?? 0} item${b['items'] == 1 ? '' : 's'}',
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                ]),
              ),
              Text('₹${_money.format((b['total'] as num?)?.toDouble() ?? 0)}',
                  style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: _ink)),
              Icon(Icons.chevron_right, color: Colors.grey.shade400, size: 20),
            ]),
          ),
        ),
    ]);
  }

  Widget _dateChip(DateTime? t) => Container(
        width: 44,
        padding: const EdgeInsets.symmetric(vertical: 5),
        decoration: BoxDecoration(color: _teal.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(10)),
        child: t == null
            ? const SizedBox(height: 30)
            : Column(children: [
                Text(DateFormat('d').format(t), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: _tealDark, height: 1.1)),
                Text(DateFormat('MMM').format(t).toUpperCase(),
                    style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: _tealDark, letterSpacing: 0.4)),
              ]),
      );

  // ---- building blocks ----

  Widget _heading(String text, {String? action, String? route}) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 22, 0, 8),
        child: Row(children: [
          Expanded(
            child: Text(text, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: _ink)),
          ),
          if (action != null && route != null)
            GestureDetector(
              onTap: () => context.push(route),
              child: Text(action, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _teal)),
            ),
        ]),
      );

  // one white card, its rows split by thin lines
  Widget _group(List<Widget> rows) => Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFE8EAED)),
        ),
        child: Material(
          color: Colors.white,
          child: Column(children: [
            for (var i = 0; i < rows.length; i++) ...[
              if (i > 0) const Divider(height: 1, thickness: 1, indent: 14, endIndent: 14, color: Color(0xFFF0F1F3)),
              rows[i],
            ],
          ]),
        ),
      );

  Widget _note(String text) => Padding(
        padding: const EdgeInsets.all(16),
        child: Text(text, style: TextStyle(fontSize: 13.5, color: Colors.grey.shade600, height: 1.4)),
      );

  // icon, label (and a line under it), the count, an arrow
  Widget _row(IconData icon, String label, String route, {int? count, String? sub, String? badge}) => InkWell(
        onTap: () => context.push(route),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
          child: Row(children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(color: _teal.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(10)),
              child: Icon(icon, color: _tealDark, size: 19),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(label, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: _ink)),
                if (sub != null) ...[
                  const SizedBox(height: 1),
                  Text(sub, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                ],
              ]),
            ),
            if (badge != null)
              Container(
                margin: const EdgeInsets.only(right: 8),
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: Colors.orange.shade50, borderRadius: BorderRadius.circular(20)),
                child: Text(badge, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: Colors.orange.shade800)),
              ),
            if (count != null || sub == null && badge == null)
              Text(count == null ? '—' : '$count',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: _ink)),
            Icon(Icons.chevron_right, color: Colors.grey.shade400, size: 20),
          ]),
        ),
      );
}
