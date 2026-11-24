import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../config/app_flavor.dart';
import '../data/divisions.dart';
import '../providers/auth_provider.dart';
import 'app_version_text.dart';

/// White, with the website's red (Tailwind red-600) for the text and icons.
const _teal = Color(0xFF00A6A4); // the app's teal, as everywhere else
const _tealSoft = Color(0xFFE6F6F6); // a light teal, behind the open divisions list
// the menu's text: Inter, regular weight, for a lighter, crisper list
const _font = 'Inter';
const _itemStyle = TextStyle(fontFamily: _font, color: _teal, fontSize: 15, fontWeight: FontWeight.w400, letterSpacing: -0.1);
const _white = Colors.white;

/// Shared hamburger-menu drawer: the user's own sections, learning, and the
/// divisions (folded away behind a + until opened). Attaching this to a
/// screen's Scaffold is enough — Flutter auto-adds the 3-line menu icon to
/// that screen's AppBar when `drawer` is set and no explicit `leading` is
/// given.
class AppDrawer extends ConsumerWidget {
  const AppDrawer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user;
    final role = user?.role;

    Widget item(IconData icon, String label, String route) => ListTile(
          leading: Icon(icon, color: _teal),
          title: Text(label, style: _itemStyle),
          visualDensity: VisualDensity.compact,
          onTap: () {
            Navigator.of(context).pop();
            context.push(route);
          },
        );

    return Drawer(
      backgroundColor: _white,
      child: SafeArea(
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            Container(
              padding: const EdgeInsets.fromLTRB(20, 28, 20, 20),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text(appName,
                    style: TextStyle(fontFamily: _font, fontSize: 26, fontWeight: FontWeight.w600, color: _teal, letterSpacing: -0.4)),
                if (user != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    (user.username != null && user.username!.isNotEmpty) ? user.username! : user.phoneNumber,
                    style: TextStyle(fontFamily: _font, fontSize: 13, color: Colors.grey.shade600),
                  ),
                ],
              ]),
            ),
            Divider(height: 1, color: Colors.grey.shade200),
            const SizedBox(height: 6),

            // the dispatch team: only their own tools (below, under Staff)
            if (!(user?.isDispatch ?? false)) ...[
            if (role == 'partner' || role == 'team_member') item(Icons.dashboard_outlined, 'Dashboard', '/dashboard'),
            // Special-type customers get a tile into their own private catalog.
            if (user?.isSpecial ?? false) item(Icons.star_outline, '13 Alpha Unit', '/special'),
            // Doctors' CRM/contact tracking and the sales slideshows aren't
            // for a doctor's or a retailer's own login.
            if (role != 'doctor' && role != 'retailer') ...[
              item(Icons.people_outline, 'Doctors', '/doctors'),
              item(Icons.slideshow_outlined, 'Presentations', '/presentations'),
            ],
            if (role == 'partner') ...[
              // the shops the partner supplies, and their orders
              item(Icons.storefront_outlined, 'My Retailers', '/retailers'),
              item(Icons.move_to_inbox_outlined, 'Customer Orders', '/retailer-orders'),
              item(Icons.groups_outlined, 'My Team', '/team'),
              // their invoices from Marg (final bills, not app orders)
              item(Icons.receipt_long_outlined, 'My Bills', '/my-bills'),
              item(Icons.payments_outlined, 'My Payments', '/payments'),
              item(Icons.event_available_outlined, 'Team Attendance', '/team-attendance'),
            ],
            if (role == 'team_member') ...[
              // their partner's retailers (less any hidden from them)
              item(Icons.storefront_outlined, 'Retailers', '/retailers'),
              item(Icons.event_available_outlined, 'My Attendance', '/my-attendance'),
              item(Icons.edit_note_outlined, 'My Daily Log', '/my-daily-log'),
            ],
            ],
            // staff (admins, employees, the dispatch team)
            if (isTeamApp && (user?.isStaff ?? false)) ...[
              const SizedBox(height: 6),
              Divider(height: 1, color: Colors.grey.shade200),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
                child: Text('STAFF', style: TextStyle(fontFamily: _font, fontSize: 11, letterSpacing: 1.1, color: Colors.grey.shade500)),
              ),
              if (user!.canPack) item(Icons.inventory_2_outlined, 'Packing', '/packing'),
              if (user.has('marg_stock_view')) item(Icons.warehouse_outlined, 'Marg Stock', '/staff/stock'),
              if (user.has('marg_bills_view')) item(Icons.receipt_long_outlined, 'Marg Bills', '/staff/bills'),
              if (user.has('freight_bills_edit') || user.has('freight_bills_view'))
                item(Icons.local_shipping_outlined, 'Freight Bills', '/staff/freight'),
              item(Icons.event_available_outlined, 'My Attendance & Leave', '/staff/attendance'),
              item(Icons.more_time, 'Missed Punch', '/staff/missed-punch'),
              if (user.has('leaves_view')) item(Icons.fact_check_outlined, 'Leave Requests', '/staff/leaves'),
              if (user.has('leaves_view')) item(Icons.rule_outlined, 'Missed Punches', '/staff/missed-punches'),
            ],
            if (role != 'retailer' && !(user?.isDispatch ?? false)) item(Icons.play_circle_outline, 'Learning', '/learning'),

            const SizedBox(height: 6),
            Divider(height: 1, color: Colors.grey.shade200),
            if (!(user?.isDispatch ?? false)) const _DivisionsSection(),
            const SizedBox(height: 20),
            // which version is installed
            const Center(child: AppVersionText()),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}

/// The divisions, folded into one row with a + that opens a compact list.
class _DivisionsSection extends StatefulWidget {
  const _DivisionsSection();

  @override
  State<_DivisionsSection> createState() => _DivisionsSectionState();
}

class _DivisionsSectionState extends State<_DivisionsSection> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      ListTile(
        leading: const Icon(Icons.category_outlined, color: _teal),
        title: const Text('Divisions', style: _itemStyle),
        visualDensity: VisualDensity.compact,
        onTap: () => setState(() => _open = !_open),
        trailing: Container(
          width: 30,
          height: 30,
          decoration: BoxDecoration(color: _teal, borderRadius: BorderRadius.circular(15)),
          child: AnimatedRotation(
            turns: _open ? 0.125 : 0, // + turns into ×
            duration: const Duration(milliseconds: 200),
            child: const Icon(Icons.add, color: _white, size: 20),
          ),
        ),
      ),
      AnimatedSize(
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
        alignment: Alignment.topCenter,
        child: !_open
            ? const SizedBox(width: double.infinity)
            : Container(
                width: double.infinity,
                margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                padding: const EdgeInsets.symmetric(vertical: 4),
                decoration: BoxDecoration(color: _tealSoft, borderRadius: BorderRadius.circular(12)),
                child: Column(
                  children: [
                    for (final d in kDivisions)
                      InkWell(
                        onTap: () {
                          Navigator.of(context).pop();
                          context.push(d.route);
                        },
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                          child: Row(children: [
                            Icon(Icons.chevron_right, size: 16, color: _teal.withValues(alpha: 0.7)),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(d.heroLabel,
                                  style: const TextStyle(fontFamily: _font, color: _teal, fontSize: 13.5, fontWeight: FontWeight.w400)),
                            ),
                          ]),
                        ),
                      ),
                  ],
                ),
              ),
      ),
    ]);
  }
}
