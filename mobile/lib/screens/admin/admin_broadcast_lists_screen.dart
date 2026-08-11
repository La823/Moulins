import 'package:flutter/material.dart';
import '../../models/broadcast_list.dart';
import '../../services/broadcast_list_service.dart';

const _teal = Color(0xFF00A6A4);
const _ink = Color(0xFF1A1A1A);

class AdminBroadcastListsScreen extends StatefulWidget {
  const AdminBroadcastListsScreen({super.key});

  @override
  State<AdminBroadcastListsScreen> createState() => _AdminBroadcastListsScreenState();
}

class _AdminBroadcastListsScreenState extends State<AdminBroadcastListsScreen> {
  final _service = BroadcastListService();
  List<BroadcastList> _lists = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final list = await _service.getLists();
      if (mounted) setState(() { _lists = list; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openEditor({BroadcastList? existing}) async {
    List<BroadcastListMember> members = [];
    if (existing != null) {
      try {
        final (_, m) = await _service.getList(existing.id);
        members = m;
      } catch (_) {}
    }
    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => _BroadcastListEditorScreen(
          listId: existing?.id,
          initialName: existing?.name ?? '',
          initialMembers: members,
        ),
      ),
    );
    _load();
  }

  Future<void> _delete(BroadcastList list) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete this list?'),
        content: Text('"${list.name}" will be permanently removed.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete', style: TextStyle(color: Colors.red))),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      await _service.deleteList(list.id);
      _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not delete list: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: Colors.black,
        title: const Text('Broadcast Lists', style: TextStyle(color: _ink, fontWeight: FontWeight.w600)),
        actions: [
          IconButton(icon: const Icon(Icons.add, color: _teal), onPressed: () => _openEditor()),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        color: _teal,
        child: _loading
            ? const Center(child: CircularProgressIndicator(color: _teal))
            : _lists.isEmpty
                ? ListView(
                    children: [
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 60),
                        child: Center(
                          child: Text("You haven't created any broadcast lists yet", style: TextStyle(color: Colors.grey.shade400)),
                        ),
                      ),
                    ],
                  )
                : ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _lists.length,
                    itemBuilder: (ctx, i) {
                      final l = _lists[i];
                      return Container(
                        margin: const EdgeInsets.only(bottom: 10),
                        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200)),
                        child: ListTile(
                          onTap: () => _openEditor(existing: l),
                          title: Text(l.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                          subtitle: Text('${l.memberCount} partner${l.memberCount != 1 ? 's' : ''}', style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                          trailing: IconButton(
                            icon: const Icon(Icons.delete_outline, color: Colors.red),
                            onPressed: () => _delete(l),
                          ),
                        ),
                      );
                    },
                  ),
      ),
    );
  }
}

class _BroadcastListEditorScreen extends StatefulWidget {
  final String? listId;
  final String initialName;
  final List<BroadcastListMember> initialMembers;

  const _BroadcastListEditorScreen({
    this.listId,
    required this.initialName,
    required this.initialMembers,
  });

  @override
  State<_BroadcastListEditorScreen> createState() => _BroadcastListEditorScreenState();
}

class _BroadcastListEditorScreenState extends State<_BroadcastListEditorScreen> {
  final _service = BroadcastListService();
  late final TextEditingController _nameCtrl;
  late List<BroadcastListMember> _members;
  List<BroadcastListMember> _allPartners = [];
  String _query = '';
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _nameCtrl = TextEditingController(text: widget.initialName);
    _members = List.of(widget.initialMembers);
    _service.searchPartners().then((list) {
      if (mounted) setState(() => _allPartners = list);
    }).catchError((_) {});
  }

  List<BroadcastListMember> get _filteredPartners {
    final memberIds = _members.map((m) => m.id).toSet();
    final q = _query.trim().toLowerCase();
    return _allPartners
        .where((p) => !memberIds.contains(p.id))
        .where((p) => q.isEmpty || p.username.toLowerCase().contains(q) || p.phoneNumber.contains(q))
        .toList();
  }

  Future<void> _save() async {
    final name = _nameCtrl.text.trim();
    if (name.isEmpty) return;
    setState(() { _saving = true; _error = null; });
    try {
      final ids = _members.map((m) => m.id).toList();
      if (widget.listId != null) {
        await _service.updateList(widget.listId!, name, ids);
      } else {
        await _service.createList(name, ids);
      }
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      setState(() { _saving = false; _error = 'Could not save list: $e'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: Colors.black,
        title: Text(widget.listId != null ? 'Edit List' : 'New List', style: const TextStyle(color: _ink, fontWeight: FontWeight.w600)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: _nameCtrl,
            decoration: InputDecoration(
              labelText: 'List Name *',
              filled: true,
              fillColor: Colors.white,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
            ),
          ),
          const SizedBox(height: 16),
          if (_members.isNotEmpty) ...[
            Text('${_members.length} partner${_members.length != 1 ? 's' : ''} in this list', style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _members.map((m) => Chip(
                    label: Text(m.username.isNotEmpty ? m.username : m.phoneNumber),
                    onDeleted: () => setState(() => _members.removeWhere((x) => x.id == m.id)),
                  )).toList(),
            ),
            const SizedBox(height: 16),
          ],
          TextField(
            onChanged: (v) => setState(() => _query = v),
            decoration: InputDecoration(
              hintText: 'Search or browse all partners...',
              prefixIcon: const Icon(Icons.search, size: 20),
              filled: true,
              fillColor: Colors.white,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
            ),
          ),
          const SizedBox(height: 8),
          Container(
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200)),
            constraints: const BoxConstraints(maxHeight: 320),
            child: _filteredPartners.isEmpty
                ? Padding(
                    padding: const EdgeInsets.all(20),
                    child: Text('No matching partners', style: TextStyle(color: Colors.grey.shade400, fontSize: 13)),
                  )
                : ListView.builder(
                    shrinkWrap: true,
                    itemCount: _filteredPartners.length,
                    itemBuilder: (ctx, i) {
                      final p = _filteredPartners[i];
                      return ListTile(
                        dense: true,
                        title: Text(p.username.isNotEmpty ? p.username : 'No name', style: const TextStyle(fontSize: 13.5)),
                        subtitle: Text(p.phoneNumber, style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                        trailing: const Icon(Icons.add_circle_outline, color: _teal),
                        onTap: () => setState(() => _members.add(p)),
                      );
                    },
                  ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 12.5)),
          ],
          const SizedBox(height: 20),
          SizedBox(
            height: 48,
            child: ElevatedButton(
              onPressed: _saving ? null : _save,
              style: ElevatedButton.styleFrom(
                backgroundColor: _teal,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                elevation: 0,
              ),
              child: _saving
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Save List'),
            ),
          ),
        ],
      ),
    );
  }
}
