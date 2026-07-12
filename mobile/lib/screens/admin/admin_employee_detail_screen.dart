import 'package:flutter/material.dart';
import '../../models/admin_user.dart';
import '../../services/admin_service.dart';

const _teal = Color(0xFF00A6A4);

class AdminEmployeeDetailScreen extends StatefulWidget {
  final String employeeId;
  const AdminEmployeeDetailScreen({super.key, required this.employeeId});

  @override
  State<AdminEmployeeDetailScreen> createState() => _AdminEmployeeDetailScreenState();
}

class _AdminEmployeeDetailScreenState extends State<AdminEmployeeDetailScreen> {
  final _service = AdminService();
  AdminEmployee? _employee;
  List<PermissionDef> _allPermissions = [];
  final Set<String> _permState = {};
  bool _loading = true;
  bool _showPassword = false;
  bool _editingPassword = false;
  final _passwordCtrl = TextEditingController();
  bool _savingPassword = false;
  bool _savingPerms = false;
  bool _deleting = false;
  String? _permSuccess;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        _service.getEmployeeDetail(widget.employeeId),
        _service.getAllPermissions(),
      ]);
      final employee = results[0] as AdminEmployee;
      final perms = results[1] as List<PermissionDef>;
      setState(() {
        _employee = employee;
        _allPermissions = perms;
        _permState
          ..clear()
          ..addAll(employee.permissions);
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  Future<void> _savePassword() async {
    if (_passwordCtrl.text.length < 4) return;
    setState(() => _savingPassword = true);
    try {
      await _service.updateEmployeePassword(widget.employeeId, _passwordCtrl.text);
      setState(() { _editingPassword = false; _savingPassword = false; });
      _passwordCtrl.clear();
      _load();
    } catch (_) {
      setState(() => _savingPassword = false);
      _showError('Could not update password');
    }
  }

  Future<void> _savePermissions() async {
    setState(() => _savingPerms = true);
    try {
      await _service.updateEmployeePermissions(widget.employeeId, _permState.toList());
      setState(() { _savingPerms = false; _permSuccess = 'Permissions updated'; });
      Future.delayed(const Duration(seconds: 3), () {
        if (mounted) setState(() => _permSuccess = null);
      });
    } catch (_) {
      setState(() => _savingPerms = false);
      _showError('Could not update permissions');
    }
  }

  Future<void> _delete() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete employee?'),
        content: Text('This will permanently delete "${_employee?.displayName}". This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Delete', style: TextStyle(color: Colors.red))),
        ],
      ),
    );
    if (confirm != true) return;
    setState(() => _deleting = true);
    try {
      await _service.deleteEmployee(widget.employeeId);
      if (mounted) Navigator.of(context).pop();
    } catch (_) {
      setState(() => _deleting = false);
      _showError('Could not delete employee');
    }
  }

  void _showError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: Colors.red));
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: Center(child: CircularProgressIndicator(color: _teal)));
    final e = _employee;
    if (e == null) return const Scaffold(body: Center(child: Text('Employee not found')));

    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: Colors.black,
        title: Text(e.displayName, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        color: _teal,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Profile
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      CircleAvatar(radius: 26, backgroundColor: _teal.withValues(alpha: 0.12), child: Text(e.displayName.isNotEmpty ? e.displayName[0].toUpperCase() : '?', style: const TextStyle(color: _teal, fontWeight: FontWeight.bold, fontSize: 18))),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(e.displayName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                            Text(e.role, style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const Divider(height: 24),
                  _infoRow('Phone', e.phoneNumber),
                  if (e.email != null) _infoRow('Email', e.email!),
                  _infoRow('Joined', _fmtDate(e.createdAt)),
                  _infoRow('Last login', e.lastLoginAt != null ? _fmtDate(e.lastLoginAt!) : 'Never'),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // Credentials
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Login Credentials', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                      TextButton(onPressed: () => setState(() => _showPassword = !_showPassword), child: Text(_showPassword ? 'Hide' : 'Show', style: const TextStyle(fontSize: 12))),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (_editingPassword) ...[
                    TextField(
                      controller: _passwordCtrl,
                      decoration: InputDecoration(
                        hintText: 'New password',
                        isDense: true,
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        TextButton(onPressed: _savingPassword ? null : _savePassword, child: Text(_savingPassword ? 'Saving...' : 'Save')),
                        TextButton(onPressed: () => setState(() => _editingPassword = false), child: const Text('Cancel')),
                      ],
                    ),
                  ] else
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(_showPassword ? (e.plainPassword ?? 'Not available') : '••••••••', style: const TextStyle(fontFamily: 'monospace', fontSize: 13)),
                        TextButton(onPressed: () => setState(() => _editingPassword = true), child: const Text('Edit', style: TextStyle(fontSize: 12))),
                      ],
                    ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // Permissions
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Permissions', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                      if (_permSuccess != null)
                        Text(_permSuccess!, style: TextStyle(fontSize: 11, color: Colors.green.shade700)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  for (final perm in _allPermissions)
                    CheckboxListTile(
                      value: _permState.contains(perm.key),
                      onChanged: (v) => setState(() {
                        if (v == true) {
                          _permState.add(perm.key);
                        } else {
                          _permState.remove(perm.key);
                        }
                      }),
                      title: Text(perm.label, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500)),
                      subtitle: Text(perm.desc, style: TextStyle(fontSize: 11.5, color: Colors.grey.shade500)),
                      controlAffinity: ListTileControlAffinity.leading,
                      contentPadding: EdgeInsets.zero,
                      activeColor: _teal,
                      dense: true,
                    ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _savingPerms ? null : _savePermissions,
                      style: ElevatedButton.styleFrom(backgroundColor: _teal, foregroundColor: Colors.white),
                      child: Text(_savingPerms ? 'Saving...' : 'Save Permissions'),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: _deleting ? null : _delete,
                style: OutlinedButton.styleFrom(foregroundColor: Colors.red, side: const BorderSide(color: Colors.red)),
                child: Text(_deleting ? 'Deleting...' : 'Delete Employee'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _infoRow(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: TextStyle(fontSize: 12.5, color: Colors.grey.shade500)),
            Flexible(child: Text(value, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500), textAlign: TextAlign.right)),
          ],
        ),
      );

  String _fmtDate(String iso) {
    final dt = DateTime.tryParse(iso);
    if (dt == null) return iso;
    return '${dt.day}/${dt.month}/${dt.year}';
  }
}
