import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/auth_provider.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user;

    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('Profile', style: TextStyle(color: Color(0xFF1A1A1A), fontWeight: FontWeight.w600)),
      ),
      body: ListView(
        children: [
          // User card
          Container(
            color: Colors.white,
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                Container(
                  width: 56, height: 56,
                  decoration: const BoxDecoration(color: Color(0xFF00A6A4), shape: BoxShape.circle),
                  child: Center(
                    child: Text(
                      (user?.displayName ?? 'U')[0].toUpperCase(),
                      style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(user?.displayName ?? 'User', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                    Text(user?.phoneNumber ?? '', style: TextStyle(color: Colors.grey.shade500, fontSize: 13)),
                    Container(
                      margin: const EdgeInsets.only(top: 4),
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(color: const Color(0xFFE8F8F8), borderRadius: BorderRadius.circular(8)),
                      child: Text(user?.role ?? 'customer', style: const TextStyle(fontSize: 11, color: Color(0xFF00A6A4), fontWeight: FontWeight.w500)),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Menu items
          Container(
            color: Colors.white,
            child: Column(
              children: [
                _menuItem(Icons.shopping_bag_outlined, 'My Orders', () => context.go('/orders')),
                _divider(),
                _menuItem(Icons.person_outlined, 'My Doctors', () => context.go('/doctors')),
              ],
            ),
          ),
          const SizedBox(height: 16),

          Container(
            color: Colors.white,
            child: _menuItem(Icons.logout, 'Logout', () async {
              await ref.read(authProvider.notifier).logout();
              if (context.mounted) context.go('/login');
            }, color: Colors.red),
          ),

          const SizedBox(height: 32),
          Center(
            child: Text('Moulins Pharmaceuticals', style: TextStyle(color: Colors.grey.shade400, fontSize: 12)),
          ),
          const SizedBox(height: 8),
          Center(
            child: Text('v1.0.0', style: TextStyle(color: Colors.grey.shade400, fontSize: 11)),
          ),
        ],
      ),
    );
  }

  Widget _menuItem(IconData icon, String label, VoidCallback onTap, {Color? color}) =>
      ListTile(
        leading: Icon(icon, color: color ?? const Color(0xFF00A6A4), size: 22),
        title: Text(label, style: TextStyle(fontSize: 15, color: color ?? const Color(0xFF1A1A1A))),
        trailing: color == null ? const Icon(Icons.chevron_right, color: Colors.grey, size: 20) : null,
        onTap: onTap,
      );

  Widget _divider() => const Divider(height: 1, indent: 56);
}
