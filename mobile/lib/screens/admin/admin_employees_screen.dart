import 'package:flutter/material.dart';
import '../../models/admin_user.dart';
import '../../services/admin_service.dart';
import '../../utils/responsive.dart';
import 'admin_employee_detail_screen.dart';

const _teal = Color(0xFF00A6A4);
const _ink = Color(0xFF1A1A1A);

class AdminEmployeesScreen extends StatefulWidget {
  const AdminEmployeesScreen({super.key});

  @override
  State<AdminEmployeesScreen> createState() => _AdminEmployeesScreenState();
}

class _AdminEmployeesScreenState extends State<AdminEmployeesScreen> {
  List<AdminEmployee> _employees = [];
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
      final employees = await AdminService().getEmployees();
      setState(() { _employees = employees; _loading = false; });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _employees.where((e) {
      final q = _search.toLowerCase();
      if (q.isEmpty) return true;
      return (e.username ?? '').toLowerCase().contains(q) ||
          e.phoneNumber.toLowerCase().contains(q) ||
          (e.email ?? '').toLowerCase().contains(q);
    }).toList();

    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('Employees', style: TextStyle(color: _ink, fontWeight: FontWeight.w600)),
      ),
      body: ResponsiveCenter(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: TextField(
                onChanged: (v) => setState(() => _search = v),
                decoration: InputDecoration(
                  hintText: 'Search employees...',
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
                      ? Center(child: Text('No employees found', style: TextStyle(color: Colors.grey.shade400)))
                      : RefreshIndicator(
                          onRefresh: _load,
                          color: _teal,
                          child: ListView.separated(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                            itemCount: filtered.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 8),
                            itemBuilder: (ctx, i) {
                              final e = filtered[i];
                              return Container(
                                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200)),
                                child: ListTile(
                                  leading: CircleAvatar(
                                    backgroundColor: _teal.withValues(alpha: 0.12),
                                    child: Text(e.displayName.isNotEmpty ? e.displayName[0].toUpperCase() : '?', style: const TextStyle(color: _teal, fontWeight: FontWeight.bold)),
                                  ),
                                  title: Text(e.displayName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                                  subtitle: Text(e.phoneNumber, style: TextStyle(fontSize: 12.5, color: Colors.grey.shade500)),
                                  trailing: const Icon(Icons.chevron_right, color: Colors.grey),
                                  onTap: () => Navigator.of(context).push(
                                    MaterialPageRoute(builder: (_) => AdminEmployeeDetailScreen(employeeId: e.id)),
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
