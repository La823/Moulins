import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/auth_provider.dart';

/// A team member allowed both kinds of order gets one Orders tab and this
/// switch at the top of it: their orders to Moulins (/orders) or to their
/// partner (/retailer-orders). Nothing for anyone else.
class TeamOrdersSwitch extends ConsumerWidget {
  /// true on the To Partner page
  final bool toPartner;
  const TeamOrdersSwitch({super.key, required this.toPartner});

  static const _teal = Color(0xFF00A6A4);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final u = ref.watch(authProvider).user;
    if (u == null || !u.isTeamMember || !u.ordersToMoulins || !u.ordersToPartner) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 2),
      child: SizedBox(
        width: double.infinity,
        child: SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: false, label: Text('To Moulins'), icon: Icon(Icons.local_pharmacy_outlined, size: 18)),
            ButtonSegment(value: true, label: Text('To Partner'), icon: Icon(Icons.outbox_outlined, size: 18)),
          ],
          selected: {toPartner},
          showSelectedIcon: false,
          style: SegmentedButton.styleFrom(
            selectedBackgroundColor: _teal.withValues(alpha: 0.14),
            selectedForegroundColor: const Color(0xFF00807E),
            side: BorderSide(color: Colors.grey.shade300),
          ),
          onSelectionChanged: (s) {
            if (s.first != toPartner) context.go(s.first ? '/retailer-orders' : '/orders');
          },
        ),
      ),
    );
  }
}
