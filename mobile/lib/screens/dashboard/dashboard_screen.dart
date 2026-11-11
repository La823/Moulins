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

const _teal = Color(0xFF00A6A4);

final _dateFmt = DateFormat('d MMM y, h:mm a');
final _money = NumberFormat('#,##,##0.00', 'en_IN');
final _moneyShort = NumberFormat.compactCurrency(locale: 'en_IN', symbol: '₹', decimalDigits: 1);

// The partner's home: their money with Moulins (Marg balance, what was billed
// this financial year, payments, ledger), their orders and their retailers'
// orders, and their people (retailers, doctors, team, meetings). Each tile
// opens its page. A team member sees their own work only (orders, doctors,
// meetings, requests). Every figure loads on its own, so one that fails
// shows a dash instead of holding up the rest.
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

    final o = await orders, d = await doctors, m = await meetings, r = await requests;
    final ret = await retailers, ro = await retailerOrders, t = await team, att = await attendance;
    final pay = await payments, b = await bills, bal = await balance, url = await ledgerUrl;
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
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      drawer: const AppDrawer(),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('Dashboard', style: TextStyle(color: Color(0xFF1A1A1A), fontWeight: FontWeight.w600)),
      ),
      body: ResponsiveCenter(
        child: RefreshIndicator(
          onRefresh: _load,
          color: _teal,
          child: _loading
              ? const Center(child: Padding(padding: EdgeInsets.all(40), child: CircularProgressIndicator(color: _teal)))
              : ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  children: _isTeamMember ? _teamMemberView() : _partnerView(),
                ),
        ),
      ),
    );
  }

  List<Widget> _teamMemberView() => [
        _heading('Your work'),
        _pair(
          _statCard('Orders', _orders, Icons.shopping_bag_outlined, '/orders', sub: _openSub()),
          _statCard('Doctors', _doctors, Icons.people_outline, '/doctors'),
        ),
        const SizedBox(height: 12),
        _pair(
          _statCard('Meetings', _meetings, Icons.calendar_today_outlined, '/meetings', sub: _upcomingSub()),
          _statCard('Requests', _requests, Icons.assignment_outlined, '/requests'),
        ),
      ];

  List<Widget> _partnerView() {
    final linked = _bills?['linked'] == true;
    return [
      _heading('Your account'),
      _balanceCard(),
      const SizedBox(height: 12),
      _pair(
        _moneyCard(
          'Billed this year',
          linked ? _rsShort(_bills?['total']) : '—',
          Icons.receipt_long_outlined,
          '/my-bills',
          sub: linked ? _billsSub() : 'Not linked to billing yet',
        ),
        _moneyCard(
          'Payments',
          _paidVerified == null ? '—' : _rsShort(_paidVerified),
          Icons.payments_outlined,
          '/payments',
          sub: _paymentsPending == null
              ? null
              : _paymentsPending! > 0
                  ? '$_paymentsPending waiting to be checked'
                  : 'Verified payments',
          alert: (_paymentsPending ?? 0) > 0,
        ),
      ),
      if (_ledgerUrl != null) ...[
        const SizedBox(height: 12),
        _ledgerCard(),
      ],
      _heading('Orders'),
      _pair(
        _statCard('My orders', _orders, Icons.shopping_bag_outlined, '/orders', sub: _openSub()),
        _statCard(
          'Retailer orders',
          _retailerOrders,
          Icons.move_to_inbox_outlined,
          '/retailer-orders',
          sub: _retailerOrdersWaiting == null
              ? null
              : _retailerOrdersWaiting! > 0
                  ? '$_retailerOrdersWaiting waiting for you'
                  : 'None waiting',
          alert: (_retailerOrdersWaiting ?? 0) > 0,
        ),
      ),
      _heading('Your people'),
      _pair(
        _statCard('Retailers', _retailers, Icons.storefront_outlined, '/retailers'),
        _statCard('Doctors', _doctors, Icons.people_outline, '/doctors'),
      ),
      const SizedBox(height: 12),
      _pair(
        _statCard(
          'Team members',
          _team,
          Icons.groups_outlined,
          '/team',
          sub: _team != null && _team! > 0 && _teamPresent != null ? '$_teamPresent present today' : null,
        ),
        _statCard('Meetings', _meetings, Icons.calendar_today_outlined, '/meetings', sub: _upcomingSub()),
      ),
      const SizedBox(height: 12),
      _pair(
        _statCard('Requests', _requests, Icons.assignment_outlined, '/requests'),
        _statCard(null, null, Icons.event_available_outlined, '/team-attendance', title: 'Team attendance'),
      ),
    ];
  }

  // ---- sub-lines ----

  String? _openSub() => _ordersOpen == null ? null : '$_ordersOpen in progress';
  String? _upcomingSub() => _meetingsUpcoming == null ? null : '$_meetingsUpcoming upcoming';

  String _billsSub() {
    final count = _bills?['count'] ?? 0;
    final bills = (_bills?['bills'] as List? ?? []).cast<Map>();
    DateTime? last;
    for (final b in bills) {
      final t = DateTime.tryParse(b['date']?.toString() ?? '');
      if (t != null && (last == null || t.isAfter(last))) last = t;
    }
    return '$count invoice${count == 1 ? '' : 's'}${last != null ? ' · last ${DateFormat('d MMM').format(last)}' : ''}';
  }

  String _rsShort(dynamic v) {
    final d = (v as num?)?.toDouble() ?? 0;
    return d.abs() >= 100000 ? _moneyShort.format(d) : '₹${NumberFormat('#,##,##0', 'en_IN').format(d)}';
  }

  // ---- building blocks ----

  Widget _heading(String text) => Padding(
        padding: const EdgeInsets.fromLTRB(2, 18, 0, 8),
        child: Text(text, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Colors.grey.shade700)),
      );

  // two cards side by side, as tall as the taller one needs
  Widget _pair(Widget a, Widget b) => IntrinsicHeight(
        child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Expanded(child: a),
          const SizedBox(width: 12),
          Expanded(child: b),
        ]),
      );

  Widget _tile({required String route, required List<Widget> children, bool alert = false}) => Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () => context.push(route),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: alert ? Colors.orange.shade300 : Colors.grey.shade200),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: children),
          ),
        ),
      );

  Widget _sub(String? text, {bool alert = false}) => text == null
      ? const SizedBox()
      : Padding(
          padding: const EdgeInsets.only(top: 3),
          child: Text(text,
              style: TextStyle(
                  fontSize: 11.5,
                  color: alert ? Colors.orange.shade800 : Colors.grey.shade600,
                  fontWeight: alert ? FontWeight.w600 : null)),
        );

  // a count (or, with [title] and no count, just a link)
  Widget _statCard(String? label, int? count, IconData icon, String route,
          {String? sub, bool alert = false, String? title}) =>
      _tile(route: route, alert: alert, children: [
        Icon(icon, color: _teal, size: 22),
        const SizedBox(height: 8),
        if (title != null) ...[
          Text(title, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600)),
          _sub('Mark and see who came in'),
        ] else ...[
          Text(count == null ? '—' : '$count', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
          Text(label ?? '', style: TextStyle(fontSize: 12.5, color: Colors.grey.shade700)),
          _sub(sub, alert: alert),
        ],
      ]);

  Widget _moneyCard(String label, String value, IconData icon, String route, {String? sub, bool alert = false}) =>
      _tile(route: route, alert: alert, children: [
        Icon(icon, color: _teal, size: 22),
        const SizedBox(height: 8),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
        ),
        Text(label, style: TextStyle(fontSize: 12.5, color: Colors.grey.shade700)),
        _sub(sub, alert: alert),
      ]);

  // The number that matters most here — the partner's live outstanding
  // balance with Moulins, synced daily from the Marg ERP system. Shown
  // prominently, same as the web dashboard's balance card.
  Widget _balanceCard() {
    final balance = _balance?.balance;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [_teal, Color(0xFF00807E)], begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Current Balance', style: TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.w500)),
          const SizedBox(height: 8),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              balance != null ? '₹${_money.format(balance)}' : 'Not available',
              style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.bold),
            ),
          ),
          if (_balance?.syncedAt != null) ...[
            const SizedBox(height: 6),
            Text('As of ${_dateFmt.format(_balance!.syncedAt!.toLocal())}',
                style: const TextStyle(color: Colors.white70, fontSize: 12)),
          ] else if (balance == null) ...[
            const SizedBox(height: 6),
            const Text('Your account isn\'t linked to Marg yet, or hasn\'t synced.',
                style: TextStyle(color: Colors.white70, fontSize: 12)),
          ],
        ],
      ),
    );
  }

  Widget _ledgerCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
          color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200)),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: _teal.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
            child: const Icon(Icons.description_outlined, color: _teal, size: 22),
          ),
          const SizedBox(width: 12),
          const Expanded(
            child: Text('Account Ledger', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
          ),
          TextButton(
            onPressed: () => launchUrl(Uri.parse(_ledgerUrl!), mode: LaunchMode.externalApplication),
            child: const Text('View'),
          ),
        ],
      ),
    );
  }
}
