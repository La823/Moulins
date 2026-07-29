import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../models/team_member.dart';
import '../../services/team_service.dart';
import '../../widgets/app_drawer.dart';

const _teal = Color(0xFF00A6A4);
const _ink = Color(0xFF1A1A1A);

class TeamScreen extends StatefulWidget {
  const TeamScreen({super.key});

  @override
  State<TeamScreen> createState() => _TeamScreenState();
}

class _TeamScreenState extends State<TeamScreen> {
  final _service = TeamService();
  List<TeamMember>? _members;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final m = await _service.getTeamMembers();
      setState(() { _members = m; _loading = false; });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  Future<void> _deleteMember(TeamMember m) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove team member?'),
        content: Text('"${m.displayName}" will be removed. Their account will be deleted.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Remove', style: TextStyle(color: Colors.red))),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await _service.deleteTeamMember(m.id);
      _load();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not remove team member')));
      }
    }
  }

  void _showAddDialog() {
    final phoneCtrl = TextEditingController();
    final passwordCtrl = TextEditingController();
    final nameCtrl = TextEditingController();
    bool submitting = false;
    String? error;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (sheetCtx) => StatefulBuilder(
        builder: (sheetCtx, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(sheetCtx).viewInsets.bottom + 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Add Team Member', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 20),
              _field(nameCtrl, 'Name'),
              const SizedBox(height: 12),
              _field(phoneCtrl, 'Phone Number *', type: TextInputType.phone),
              const SizedBox(height: 12),
              _field(passwordCtrl, 'Password *'),
              if (error != null) ...[
                const SizedBox(height: 8),
                Text(error!, style: const TextStyle(color: Colors.red, fontSize: 12.5)),
              ],
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  onPressed: submitting
                      ? null
                      : () async {
                          if (phoneCtrl.text.trim().isEmpty || passwordCtrl.text.trim().isEmpty) return;
                          setSheetState(() { submitting = true; error = null; });
                          try {
                            await _service.createTeamMember(
                              phoneNumber: phoneCtrl.text.trim(),
                              password: passwordCtrl.text.trim(),
                              username: nameCtrl.text.trim(),
                            );
                            if (sheetCtx.mounted) Navigator.pop(sheetCtx);
                            _load();
                          } catch (e) {
                            setSheetState(() { submitting = false; error = 'Could not create team member. Please try again.'; });
                          }
                        },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _teal,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    elevation: 0,
                  ),
                  child: submitting
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Text('Create Team Member'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _field(TextEditingController ctrl, String label, {TextInputType type = TextInputType.text}) => TextField(
        controller: ctrl,
        keyboardType: type,
        decoration: InputDecoration(
          labelText: label,
          filled: true,
          fillColor: Colors.grey.shade50,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _teal)),
        ),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      drawer: const AppDrawer(),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('My Team', style: TextStyle(color: _ink, fontWeight: FontWeight.w600)),
        actions: [
          IconButton(
            icon: const Icon(Icons.event_available_outlined, color: _teal),
            tooltip: 'Team Attendance',
            onPressed: () => context.push('/team-attendance'),
          ),
          IconButton(icon: const Icon(Icons.add, color: _teal), onPressed: _showAddDialog),
          const SizedBox(width: 4),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: _teal))
          : _members == null || _members!.isEmpty
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.people_outline, size: 64, color: Colors.grey.shade300),
                      const SizedBox(height: 16),
                      const Text('No team members yet', style: TextStyle(color: Colors.grey, fontSize: 16)),
                      const SizedBox(height: 12),
                      TextButton.icon(
                        icon: const Icon(Icons.add, color: _teal),
                        label: const Text('Add Team Member', style: TextStyle(color: _teal)),
                        onPressed: _showAddDialog,
                      ),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  color: _teal,
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: _members!.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (ctx, i) {
                      final m = _members![i];
                      return Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          border: Border.all(color: Colors.grey.shade200),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 40, height: 40,
                              decoration: const BoxDecoration(color: Color(0xFFE8F8F8), shape: BoxShape.circle),
                              alignment: Alignment.center,
                              child: Text(
                                m.displayName.isNotEmpty ? m.displayName[0].toUpperCase() : '?',
                                style: const TextStyle(color: _teal, fontWeight: FontWeight.w600),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(m.displayName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                                  Text(m.phoneNumber, style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                                ],
                              ),
                            ),
                            TextButton(
                              onPressed: () => context.push('/team/${m.id}', extra: m),
                              child: const Text('View', style: TextStyle(color: _teal, fontSize: 13)),
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete_outline, color: Colors.red, size: 20),
                              onPressed: () => _deleteMember(m),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
    );
  }
}
