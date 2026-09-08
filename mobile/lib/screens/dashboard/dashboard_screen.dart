import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../providers/auth_provider.dart';
import '../../services/ledger_service.dart';
import '../../services/order_service.dart';
import '../../services/doctor_service.dart';
import '../../services/meeting_service.dart';
import '../../services/request_service.dart';
import '../../utils/responsive.dart';
import '../../widgets/app_drawer.dart';

const _teal = Color(0xFF00A6A4);

final _dateFmt = DateFormat('d MMM y, h:mm a');

// Mirrors the web partner dashboard (frontend .../partner-panel/dashboard) —
// summary counts, then the Marg balance front-and-center, then quick links
// into the sections that make up those counts.
class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});

  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  bool _loading = true;
  int _orderCount = 0;
  int _doctorCount = 0;
  int _meetingCount = 0;
  int _requestCount = 0;
  MargBalance? _balance;
  String? _ledgerUrl;
  bool _isTeamMember = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final role = ref.read(authProvider).user?.role;
    _isTeamMember = role == 'team_member';

    final results = await Future.wait([
      OrderService().getMyOrders().then((l) => l.length).catchError((_) => 0),
      DoctorService().getDoctors().then((l) => l.length).catchError((_) => 0),
      MeetingService().getMeetings().then((l) => l.length).catchError((_) => 0),
      RequestService().getRequests().then((l) => l.length).catchError((_) => 0),
    ]);

    MargBalance? balance;
    String? ledgerUrl;
    if (!_isTeamMember) {
      balance = await LedgerService().getBalance().catchError((_) => MargBalance());
      ledgerUrl = await LedgerService().getLedgerUrl().catchError((_) => null);
    }

    if (mounted) {
      setState(() {
        _orderCount = results[0];
        _doctorCount = results[1];
        _meetingCount = results[2];
        _requestCount = results[3];
        _balance = balance;
        _ledgerUrl = ledgerUrl;
        _loading = false;
      });
    }
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
                  padding: const EdgeInsets.all(16),
                  children: [
                    // Summary counts
                    GridView.count(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      crossAxisCount: 2,
                      mainAxisSpacing: 12,
                      crossAxisSpacing: 12,
                      childAspectRatio: 1.8,
                      children: [
                        _statCard('Orders', _orderCount, Icons.shopping_bag_outlined, () => context.push('/orders')),
                        _statCard('Doctors', _doctorCount, Icons.people_outline, () => context.push('/doctors')),
                        _statCard('Meetings', _meetingCount, Icons.calendar_today_outlined, () => context.push('/meetings')),
                        _statCard('Requests', _requestCount, Icons.assignment_outlined, () => context.push('/requests')),
                      ],
                    ),

                    if (!_isTeamMember) ...[
                      const SizedBox(height: 16),
                      _balanceCard(),
                    ],

                    if (!_isTeamMember && _ledgerUrl != null) ...[
                      const SizedBox(height: 16),
                      _ledgerCard(),
                    ],
                  ],
                ),
        ),
      ),
    );
  }

  Widget _statCard(String label, int count, IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: _teal, size: 22),
            const SizedBox(height: 8),
            Text('$count', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
            Text(label, style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
          ],
        ),
      ),
    );
  }

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
          Text(
            balance != null
                ? '₹${NumberFormat("#,##,##0.00", "en_IN").format(balance)}'
                : 'Not available',
            style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.bold),
          ),
          if (_balance?.syncedAt != null) ...[
            const SizedBox(height: 6),
            Text('As of ${_dateFmt.format(_balance!.syncedAt!.toLocal())}', style: const TextStyle(color: Colors.white70, fontSize: 12)),
          ] else if (balance == null) ...[
            const SizedBox(height: 6),
            const Text('Your account isn\'t linked to Marg yet, or hasn\'t synced.', style: TextStyle(color: Colors.white70, fontSize: 12)),
          ],
        ],
      ),
    );
  }

  Widget _ledgerCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200)),
      child: Row(
        children: [
          Container(
            width: 40, height: 40,
            decoration: BoxDecoration(color: _teal.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
            child: const Icon(Icons.receipt_long_outlined, color: _teal, size: 22),
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
