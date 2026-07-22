import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/auth_provider.dart';
import '../../services/admin_service.dart';
import '../../widgets/notification_bell_button.dart';
import '../../widgets/chat_button.dart';
import '../../widgets/profile_button.dart';
import '../../utils/responsive.dart';
import 'admin_customers_screen.dart';
import 'admin_employees_screen.dart';
import 'admin_products_screen.dart';
import '../../widgets/app_drawer.dart';

const _teal = Color(0xFF00A6A4);
const _ink = Color(0xFF1A1A1A);

class AdminDashboardScreen extends ConsumerStatefulWidget {
  const AdminDashboardScreen({super.key});

  @override
  ConsumerState<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends ConsumerState<AdminDashboardScreen> {
  DashboardStats? _stats;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final user = ref.read(authProvider).user!;
    final isAdmin = user.role == 'admin';
    try {
      final stats = await AdminService().getDashboardStats(
        canSeeProducts: isAdmin || user.permissions.contains('products'),
        canSeeCustomers: isAdmin || user.permissions.contains('customers'),
        // Employee management is admin-only on the web too — not permission-gated.
        canSeeEmployees: isAdmin,
      );
      setState(() { _stats = stats; _loading = false; });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user!;
    final isAdmin = user.role == 'admin';
    final canSeeProducts = isAdmin || user.permissions.contains('products');
    final canSeeCustomers = isAdmin || user.permissions.contains('customers');
    final canSeeEmployees = isAdmin;

    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      drawer: const AppDrawer(),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('Admin', style: TextStyle(color: _ink, fontWeight: FontWeight.w600)),
        actions: const [ChatButton(), NotificationBellButton(), ProfileButton(), SizedBox(width: 4)],
      ),
      body: ResponsiveCenter(
        child: RefreshIndicator(
          onRefresh: _load,
          color: _teal,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (_loading)
                const Center(child: Padding(padding: EdgeInsets.all(40), child: CircularProgressIndicator(color: _teal)))
              else ...[
                GridView.count(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisCount: 2,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                  childAspectRatio: 1.6,
                  children: [
                    if (canSeeProducts) ...[
                      _StatCard(label: 'Total Products', value: _stats?.totalProducts ?? 0, icon: Icons.medication_outlined),
                      _StatCard(label: 'Active Products', value: _stats?.activeProducts ?? 0, icon: Icons.check_circle_outline),
                    ],
                    if (canSeeCustomers)
                      _StatCard(label: 'Customers', value: _stats?.totalCustomers ?? 0, icon: Icons.people_outline),
                    if (canSeeEmployees)
                      _StatCard(label: 'Employees', value: _stats?.totalEmployees ?? 0, icon: Icons.badge_outlined),
                  ],
                ),
                const SizedBox(height: 24),
                const Text('Manage', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: _ink)),
                const SizedBox(height: 10),
                if (canSeeProducts) ...[
                  _ManageTile(
                    icon: Icons.medication_outlined,
                    label: 'Products',
                    subtitle: 'Add, view, or delete products',
                    onTap: () => Navigator.of(context)
                        .push(MaterialPageRoute(builder: (_) => const AdminProductsScreen()))
                        .then((_) => _load()),
                  ),
                  const SizedBox(height: 10),
                ],
                if (canSeeCustomers) ...[
                  _ManageTile(
                    icon: Icons.people_outline,
                    label: 'Customers',
                    subtitle: 'View and manage customer accounts',
                    onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AdminCustomersScreen())),
                  ),
                  const SizedBox(height: 10),
                ],
                if (canSeeEmployees)
                  _ManageTile(
                    icon: Icons.badge_outlined,
                    label: 'Employees',
                    subtitle: 'View and manage employee accounts & permissions',
                    onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AdminEmployeesScreen())),
                  ),
                if (!canSeeProducts && !canSeeCustomers && !canSeeEmployees)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 40),
                    child: Center(
                      child: Text(
                        "You don't have any admin permissions assigned yet.",
                        style: TextStyle(color: Colors.grey.shade400, fontSize: 13),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final int value;
  final IconData icon;
  const _StatCard({required this.label, required this.value, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: _teal, size: 20),
          const SizedBox(height: 8),
          Text('$value', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: _ink)),
          Text(label, style: TextStyle(fontSize: 11.5, color: Colors.grey.shade500)),
        ],
      ),
    );
  }
}

class _ManageTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String subtitle;
  final VoidCallback onTap;
  const _ManageTile({required this.icon, required this.label, required this.subtitle, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200)),
      child: ListTile(
        leading: Container(
          width: 40, height: 40,
          decoration: BoxDecoration(color: _teal.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
          child: Icon(icon, color: _teal),
        ),
        title: Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
        subtitle: Text(subtitle, style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
        trailing: const Icon(Icons.chevron_right, color: Colors.grey),
        onTap: onTap,
      ),
    );
  }
}
