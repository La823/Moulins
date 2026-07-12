import 'package:flutter/material.dart';
import '../../services/admin_service.dart';
import '../../widgets/notification_bell_button.dart';
import '../../widgets/chat_button.dart';
import '../../widgets/profile_button.dart';
import '../../utils/responsive.dart';
import 'admin_customers_screen.dart';
import 'admin_employees_screen.dart';

const _teal = Color(0xFF00A6A4);
const _ink = Color(0xFF1A1A1A);

class AdminDashboardScreen extends StatefulWidget {
  const AdminDashboardScreen({super.key});

  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen> {
  DashboardStats? _stats;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final stats = await AdminService().getDashboardStats();
      setState(() { _stats = stats; _loading = false; });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey.shade50,
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
                    _StatCard(label: 'Total Products', value: _stats?.totalProducts ?? 0, icon: Icons.medication_outlined),
                    _StatCard(label: 'Active Products', value: _stats?.activeProducts ?? 0, icon: Icons.check_circle_outline),
                    _StatCard(label: 'Customers', value: _stats?.totalCustomers ?? 0, icon: Icons.people_outline),
                    _StatCard(label: 'Employees', value: _stats?.totalEmployees ?? 0, icon: Icons.badge_outlined),
                  ],
                ),
                const SizedBox(height: 24),
                const Text('Manage', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: _ink)),
                const SizedBox(height: 10),
                _ManageTile(
                  icon: Icons.people_outline,
                  label: 'Customers',
                  subtitle: 'View and manage customer accounts',
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AdminCustomersScreen())),
                ),
                const SizedBox(height: 10),
                _ManageTile(
                  icon: Icons.badge_outlined,
                  label: 'Employees',
                  subtitle: 'View and manage employee accounts & permissions',
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AdminEmployeesScreen())),
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
