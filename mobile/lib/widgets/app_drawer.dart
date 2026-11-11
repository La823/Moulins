import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../data/divisions.dart';
import '../providers/auth_provider.dart';

/// White, with the website's red (Tailwind red-600) for the text and icons.
const _red = Color(0xFFDC2626);
const _redSoft = Color(0xFFFEF2F2); // red-50, behind the open divisions list
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
          leading: Icon(icon, color: _red),
          title: Text(label, style: const TextStyle(color: _red, fontWeight: FontWeight.w500)),
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
                const Text('Moulins', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: _red)),
                if (user != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    (user.username != null && user.username!.isNotEmpty) ? user.username! : user.phoneNumber,
                    style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
                  ),
                ],
              ]),
            ),
            Divider(height: 1, color: Colors.grey.shade200),
            const SizedBox(height: 6),

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
              item(Icons.move_to_inbox_outlined, 'Retailer Orders', '/retailer-orders'),
              item(Icons.groups_outlined, 'My Team', '/team'),
              // their invoices from Marg (final bills, not app orders)
              item(Icons.receipt_long_outlined, 'My Bills', '/my-bills'),
              item(Icons.payments_outlined, 'My Payments', '/payments'),
              item(Icons.event_available_outlined, 'Team Attendance', '/team-attendance'),
            ],
            if (role == 'team_member') ...[
              item(Icons.event_available_outlined, 'My Attendance', '/my-attendance'),
              item(Icons.edit_note_outlined, 'My Daily Log', '/my-daily-log'),
            ],
            if (role != 'retailer') item(Icons.play_circle_outline, 'Learning', '/learning'),

            const SizedBox(height: 6),
            Divider(height: 1, color: Colors.grey.shade200),
            const _DivisionsSection(),
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
        leading: const Icon(Icons.category_outlined, color: _red),
        title: const Text('Divisions', style: TextStyle(color: _red, fontWeight: FontWeight.w500)),
        visualDensity: VisualDensity.compact,
        onTap: () => setState(() => _open = !_open),
        trailing: Container(
          width: 30,
          height: 30,
          decoration: BoxDecoration(color: _red, borderRadius: BorderRadius.circular(15)),
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
                decoration: BoxDecoration(color: _redSoft, borderRadius: BorderRadius.circular(12)),
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
                            Icon(Icons.chevron_right, size: 16, color: _red.withValues(alpha: 0.7)),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(d.heroLabel, style: const TextStyle(color: _red, fontSize: 13.5)),
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
