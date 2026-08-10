import 'package:flutter/material.dart';
import '../../models/transport.dart';
import '../../models/transport_mode.dart';
import '../../services/transport_service.dart';

const _teal = Color(0xFF00A6A4);
const _ink = Color(0xFF1A1A1A);

class AdminTransportsScreen extends StatefulWidget {
  const AdminTransportsScreen({super.key});

  @override
  State<AdminTransportsScreen> createState() => _AdminTransportsScreenState();
}

class _AdminTransportsScreenState extends State<AdminTransportsScreen> {
  final _service = TransportService();
  List<Transport> _transports = [];
  List<TransportMode> _modes = [];
  bool _loading = true;
  String _modeFilter = '';

  @override
  void initState() {
    super.initState();
    _loadModes();
    _load();
  }

  Future<void> _loadModes() async {
    try {
      final list = await _service.getModes();
      if (mounted) setState(() => _modes = list);
    } catch (_) {
      // non-fatal — mode picker/filter just stays empty
    }
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final list = await _service.getTransports(mode: _modeFilter.isEmpty ? null : _modeFilter);
      setState(() { _transports = list; _loading = false; });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  Future<void> _showManageModes() async {
    final nameCtrl = TextEditingController();
    bool submitting = false;
    String? error;

    await showModalBottomSheet(
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
              const Text('Modes of Transportation', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 16),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: _modes.map((m) => Chip(
                      label: Text(m.name),
                      onDeleted: () async {
                        try {
                          await _service.deleteMode(m.id);
                          await _loadModes();
                          setSheetState(() {});
                        } catch (_) {
                          setSheetState(() => error = 'Could not delete "${m.name}"');
                        }
                      },
                    )).toList(),
              ),
              if (_modes.isEmpty) Text('No modes yet — add one below', style: TextStyle(color: Colors.grey.shade400, fontSize: 13)),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(child: _field(nameCtrl, 'New mode, e.g. hand delivery')),
                  const SizedBox(width: 10),
                  ElevatedButton(
                    onPressed: submitting
                        ? null
                        : () async {
                            final name = nameCtrl.text.trim().toLowerCase();
                            if (name.isEmpty) return;
                            setSheetState(() { submitting = true; error = null; });
                            try {
                              await _service.createMode(name);
                              nameCtrl.clear();
                              await _loadModes();
                              setSheetState(() => submitting = false);
                            } catch (e) {
                              setSheetState(() { submitting = false; error = 'Could not add mode (it may already exist)'; });
                            }
                          },
                    style: ElevatedButton.styleFrom(backgroundColor: _teal, foregroundColor: Colors.white),
                    child: submitting
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('Add'),
                  ),
                ],
              ),
              if (error != null) ...[
                const SizedBox(height: 8),
                Text(error!, style: const TextStyle(color: Colors.red, fontSize: 12.5)),
              ],
            ],
          ),
        ),
      ),
    );
    _load();
  }

  Future<void> _showAddDialog() async {
    if (_modes.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Add a mode of transportation first')),
      );
      return;
    }
    final nameCtrl = TextEditingController();
    final gstCtrl = TextEditingController();
    String mode = _modes.first.name;
    bool submitting = false;
    String? error;

    await showModalBottomSheet(
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
              const Text('Add Transport', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 20),
              Wrap(
                spacing: 10,
                runSpacing: 8,
                children: _modes.map((m) {
                  final selected = mode == m.name;
                  return GestureDetector(
                    onTap: () => setSheetState(() => mode = m.name),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      decoration: BoxDecoration(
                        color: selected ? _teal : Colors.grey.shade100,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(m.name, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: selected ? Colors.white : Colors.grey.shade700)),
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: 16),
              _field(nameCtrl, 'Name (e.g. Blue Dart) *'),
              const SizedBox(height: 12),
              _field(gstCtrl, 'GST Number (optional)'),
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
                          final name = nameCtrl.text.trim();
                          if (name.isEmpty) return;
                          setSheetState(() { submitting = true; error = null; });
                          try {
                            await _service.createTransport(
                              mode: mode,
                              name: name,
                              gstNumber: gstCtrl.text.trim().isEmpty ? null : gstCtrl.text.trim(),
                            );
                            if (sheetCtx.mounted) Navigator.pop(sheetCtx);
                            _load();
                          } catch (e) {
                            setSheetState(() { submitting = false; error = 'Could not add transport. It may already exist.'; });
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
                      : const Text('Add Transport'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _showEditDialog(Transport t) async {
    final nameCtrl = TextEditingController(text: t.name);
    final gstCtrl = TextEditingController(text: t.gstNumber ?? '');
    bool submitting = false;
    String? error;

    await showModalBottomSheet(
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
              Text('Edit ${t.mode == 'courier' ? 'Courier' : 'Transport'}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 20),
              _field(nameCtrl, 'Name *'),
              const SizedBox(height: 12),
              _field(gstCtrl, 'GST Number (optional)'),
              if (error != null) ...[
                const SizedBox(height: 8),
                Text(error!, style: const TextStyle(color: Colors.red, fontSize: 12.5)),
              ],
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: submitting
                          ? null
                          : () async {
                              final confirm = await showDialog<bool>(
                                context: sheetCtx,
                                builder: (ctx) => AlertDialog(
                                  title: const Text('Delete transport?'),
                                  content: Text('"${t.name}" will be removed.'),
                                  actions: [
                                    TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                                    TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete', style: TextStyle(color: Colors.red))),
                                  ],
                                ),
                              );
                              if (confirm != true) return;
                              setSheetState(() => submitting = true);
                              try {
                                await _service.deleteTransport(t.id);
                                if (sheetCtx.mounted) Navigator.pop(sheetCtx);
                                _load();
                              } catch (_) {
                                setSheetState(() { submitting = false; error = 'Could not delete transport'; });
                              }
                            },
                      style: OutlinedButton.styleFrom(foregroundColor: Colors.red, side: const BorderSide(color: Colors.red)),
                      child: const Text('Delete'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: submitting
                          ? null
                          : () async {
                              final name = nameCtrl.text.trim();
                              if (name.isEmpty) return;
                              setSheetState(() { submitting = true; error = null; });
                              try {
                                await _service.updateTransport(
                                  t.id,
                                  name: name,
                                  gstNumber: gstCtrl.text.trim().isEmpty ? null : gstCtrl.text.trim(),
                                );
                                if (sheetCtx.mounted) Navigator.pop(sheetCtx);
                                _load();
                              } catch (e) {
                                setSheetState(() { submitting = false; error = 'Could not save changes'; });
                              }
                            },
                      style: ElevatedButton.styleFrom(backgroundColor: _teal, foregroundColor: Colors.white),
                      child: submitting
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Text('Save'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _field(TextEditingController ctrl, String label) => TextField(
        controller: ctrl,
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
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: Colors.black,
        title: const Text('Transports', style: TextStyle(color: _ink, fontWeight: FontWeight.w600)),
        actions: [
          IconButton(icon: const Icon(Icons.tune, color: _ink), tooltip: 'Manage Modes', onPressed: _showManageModes),
          IconButton(icon: const Icon(Icons.add, color: _teal), onPressed: _showAddDialog),
        ],
      ),
      body: Column(
        children: [
          Container(
            color: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              children: [
                ('', 'All'),
                ..._modes.map((m) => (m.name, m.name)),
              ].map((t) {
                final (value, label) = t;
                final active = _modeFilter == value;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: GestureDetector(
                    onTap: () { setState(() => _modeFilter = value); _load(); },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: active ? _ink : Colors.grey.shade100,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(label, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: active ? Colors.white : Colors.grey.shade600)),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _load,
              color: _teal,
              child: _loading
                  ? const Center(child: CircularProgressIndicator(color: _teal))
                  : _transports.isEmpty
                      ? ListView(
                          children: [
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: 60),
                              child: Center(child: Text('No transports added yet', style: TextStyle(color: Colors.grey.shade400))),
                            ),
                          ],
                        )
                      : ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: _transports.length,
                          itemBuilder: (ctx, i) {
                            final t = _transports[i];
                            return Container(
                              margin: const EdgeInsets.only(bottom: 10),
                              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200)),
                              child: ListTile(
                                onTap: () => _showEditDialog(t),
                                title: Text(t.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                                subtitle: Text(t.gstNumber ?? 'No GST number', style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                                trailing: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: (t.mode == 'courier' ? Colors.blue : Colors.purple).withValues(alpha: 0.1),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Text(t.mode, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: t.mode == 'courier' ? Colors.blue : Colors.purple)),
                                ),
                              ),
                            );
                          },
                        ),
            ),
          ),
        ],
      ),
    );
  }
}
