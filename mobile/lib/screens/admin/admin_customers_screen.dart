import 'package:flutter/material.dart';
import '../../models/admin_user.dart';
import '../../services/admin_service.dart';
import '../../utils/responsive.dart';
import 'admin_customer_detail_screen.dart';

const _teal = Color(0xFF00A6A4);
const _ink = Color(0xFF1A1A1A);

class AdminCustomersScreen extends StatefulWidget {
  const AdminCustomersScreen({super.key});

  @override
  State<AdminCustomersScreen> createState() => _AdminCustomersScreenState();
}

class _AdminCustomersScreenState extends State<AdminCustomersScreen> {
  List<AdminCustomer> _customers = [];
  bool _loading = true;
  String _search = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final customers = await AdminService().getCustomers();
      setState(() { _customers = customers; _loading = false; });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _customers.where((c) {
      final q = _search.toLowerCase();
      if (q.isEmpty) return true;
      return (c.username ?? '').toLowerCase().contains(q) ||
          c.phoneNumber.toLowerCase().contains(q) ||
          (c.email ?? '').toLowerCase().contains(q);
    }).toList();

    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('Customers', style: TextStyle(color: _ink, fontWeight: FontWeight.w600)),
      ),
      body: ResponsiveCenter(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: TextField(
                onChanged: (v) => setState(() => _search = v),
                decoration: InputDecoration(
                  hintText: 'Search customers...',
                  prefixIcon: const Icon(Icons.search, color: Colors.grey),
                  filled: true,
                  fillColor: Colors.white,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade200)),
                  contentPadding: const EdgeInsets.symmetric(vertical: 0),
                ),
              ),
            ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator(color: _teal))
                  : filtered.isEmpty
                      ? Center(child: Text('No customers found', style: TextStyle(color: Colors.grey.shade400)))
                      : RefreshIndicator(
                          onRefresh: _load,
                          color: _teal,
                          child: ListView.separated(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                            itemCount: filtered.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 8),
                            itemBuilder: (ctx, i) {
                              final c = filtered[i];
                              return Container(
                                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200)),
                                child: ListTile(
                                  leading: CircleAvatar(
                                    backgroundColor: _teal.withValues(alpha: 0.12),
                                    child: Text(c.displayName.isNotEmpty ? c.displayName[0].toUpperCase() : '?', style: const TextStyle(color: _teal, fontWeight: FontWeight.bold)),
                                  ),
                                  title: Text(c.displayName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                                  subtitle: Text(c.phoneNumber, style: TextStyle(fontSize: 12.5, color: Colors.grey.shade500)),
                                  trailing: const Icon(Icons.chevron_right, color: Colors.grey),
                                  onTap: () => Navigator.of(context).push(
                                    MaterialPageRoute(builder: (_) => AdminCustomerDetailScreen(customerId: c.id)),
                                  ).then((_) => _load()),
                                ),
                              );
                            },
                          ),
                        ),
            ),
          ],
        ),
      ),
    );
  }
}
