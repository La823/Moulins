import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../services/packing_service.dart';
import '../../services/retailer_service.dart';

const _teal = Color(0xFF00A6A4);
const _ink = Color(0xFF1A1A1A);

/// Orders to pack (confirmed, oldest first) and the ones packed lately.
class PackingListScreen extends StatefulWidget {
  const PackingListScreen({super.key});

  @override
  State<PackingListScreen> createState() => _PackingListScreenState();
}

class _PackingListScreenState extends State<PackingListScreen> {
  final _service = PackingService();
  bool _packed = false;
  List<PackingListRow>? _rows;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final rows = await _service.list(packed: _packed);
      if (mounted) setState(() { _rows = rows; _error = null; });
    } catch (e) {
      if (mounted) setState(() { _error = RetailerService.messageOf(e, fallback: 'The orders could not be loaded.'); _rows ??= []; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('d MMM, h:mm a');
    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('Packing', style: TextStyle(color: _ink, fontWeight: FontWeight.w600)),
      ),
      body: RefreshIndicator(
        color: _teal,
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            SegmentedButton<bool>(
              segments: const [
                ButtonSegment(value: false, label: Text('To pack'), icon: Icon(Icons.inventory_2_outlined)),
                ButtonSegment(value: true, label: Text('Packed'), icon: Icon(Icons.check_circle_outline)),
              ],
              selected: {_packed},
              onSelectionChanged: (s) {
                setState(() { _packed = s.first; _rows = null; });
                _load();
              },
            ),
            const SizedBox(height: 14),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Text(_error!, style: TextStyle(color: Colors.red.shade700, fontSize: 13)),
              ),
            if (_rows == null)
              const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator(color: _teal)))
            else if (_rows!.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 48),
                child: Center(
                  child: Text(_packed ? 'No packed orders yet.' : 'Nothing waiting to be packed.',
                      style: TextStyle(color: Colors.grey.shade500)),
                ),
              )
            else
              for (final r in _rows!)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Material(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(12),
                      onTap: () async {
                        await context.push('/packing/${r.id}');
                        _load();
                      },
                      child: Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200)),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(r.customer.isEmpty ? 'Unknown customer' : r.customer,
                                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15, color: _ink)),
                                  const SizedBox(height: 2),
                                  Text(
                                    [
                                      if (r.city.isNotEmpty) r.city,
                                      if (r.createdAt != null) 'Ordered ${fmt.format(r.createdAt!)}',
                                    ].join(' · '),
                                    style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                                  ),
                                  if (_packed && r.packedAt != null)
                                    Text('Packed by ${r.packedBy.isEmpty ? '—' : r.packedBy} · ${fmt.format(r.packedAt!)}',
                                        style: TextStyle(fontSize: 12, color: Colors.teal.shade700)),
                                ],
                              ),
                            ),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text('${r.ticked}/${r.items}',
                                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: _ink)),
                                Text(
                                  _packed ? 'packed' : (r.started ? 'being packed' : 'not started'),
                                  style: TextStyle(fontSize: 11, color: r.started && !_packed ? _teal : Colors.grey.shade500),
                                ),
                              ],
                            ),
                            const SizedBox(width: 4),
                            Icon(Icons.chevron_right, color: Colors.grey.shade400),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
          ],
        ),
      ),
    );
  }
}
