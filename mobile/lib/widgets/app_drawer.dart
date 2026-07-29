import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../data/divisions.dart';
import '../providers/auth_provider.dart';

const _teal = Color(0xFF00A6A4);
const _ink = Color(0xFF1A1A1A);

/// Shared hamburger-menu drawer: divisions, doctors, learning. Attaching
/// this to a screen's Scaffold is enough — Flutter auto-adds the 3-line
/// menu icon to that screen's AppBar when `drawer` is set and no explicit
/// `leading` is given.
class AppDrawer extends ConsumerWidget {
  const AppDrawer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user;

    return Drawer(
      backgroundColor: Colors.white,
      child: SafeArea(
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            const DrawerHeader(
              decoration: BoxDecoration(color: Colors.white),
              child: Align(
                alignment: Alignment.bottomLeft,
                child: Text(
                  'Moulins',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.w600, color: _ink),
                ),
              ),
            ),

            // Special-type customers get a tile into their own private catalog.
            if (user?.isSpecial ?? false)
              ListTile(
                leading: const Icon(Icons.star_outline, color: _teal),
                title: const Text('13 Alpha Unit'),
                onTap: () {
                  Navigator.of(context).pop();
                  context.push('/special');
                },
              ),
            ListTile(
              leading: const Icon(Icons.people_outline, color: _teal),
              title: const Text('Doctors'),
              onTap: () {
                Navigator.of(context).pop();
                context.push('/doctors');
              },
            ),
            if (user?.role == 'partner') ...[
              ListTile(
                leading: const Icon(Icons.groups_outlined, color: _teal),
                title: const Text('My Team'),
                onTap: () {
                  Navigator.of(context).pop();
                  context.push('/team');
                },
              ),
              ListTile(
                leading: const Icon(Icons.event_available_outlined, color: _teal),
                title: const Text('Team Attendance'),
                onTap: () {
                  Navigator.of(context).pop();
                  context.push('/team-attendance');
                },
              ),
            ],
            if (user?.role == 'team_member') ...[
              ListTile(
                leading: const Icon(Icons.event_available_outlined, color: _teal),
                title: const Text('My Attendance'),
                onTap: () {
                  Navigator.of(context).pop();
                  context.push('/my-attendance');
                },
              ),
              ListTile(
                leading: const Icon(Icons.edit_note_outlined, color: _teal),
                title: const Text('My Daily Log'),
                onTap: () {
                  Navigator.of(context).pop();
                  context.push('/my-daily-log');
                },
              ),
            ],
            ListTile(
              leading: const Icon(Icons.play_circle_outline, color: _teal),
              title: const Text('Learning'),
              onTap: () {
                Navigator.of(context).pop();
                context.push('/learning');
              },
            ),

            const Padding(
              padding: EdgeInsets.fromLTRB(16, 20, 16, 8),
              child: Text(
                'DIVISIONS',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.grey, letterSpacing: 1),
              ),
            ),
            for (final d in kDivisions)
              ListTile(
                dense: true,
                title: Text(d.heroLabel, style: const TextStyle(color: _ink)),
                subtitle: Text(d.heroTitle, style: const TextStyle(fontSize: 11.5)),
                onTap: () {
                  Navigator.of(context).pop();
                  context.push(d.route);
                },
              ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}
