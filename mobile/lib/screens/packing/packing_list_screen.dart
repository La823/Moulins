import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../services/packing_service.dart';
import '../../services/retailer_service.dart';
import '../../widgets/app_drawer.dart';
import '../../widgets/shell_leading.dart';

const _teal = Color(0xFF00A6A4);
const _ink = Color(0xFF1A1A1A);
// distinct colours per detail, so they stand apart at a glance
const _pageBg = Color(0xFFEEF1F5);
const _cardEdge = Color(0xFFCBD5E1);
const _muted = Color(0xFF475569);
const _assigned = Color(0xFF6D28D9);
const _packedGreen = Color(0xFF047857);
const _inProgress = Color(0xFFC2410C);

/// Orders to pack (sent to packing): the ones assigned to the packer by the
/// rotation first, then the rest of the team's (anyone can help); and the
/// ones packed lately.
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
      backgroundColor: _pageBg,
      drawer: const AppDrawer(),
      appBar: AppBar(
        leadingWidth: ShellLeading.widthFor(context),
        leading: const ShellLeading(),
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
              for (final (i, r) in _rows!.indexed) ...[
                // to pack: a heading where "mine" starts and where the team's start
                if (!_packed && (i == 0 || _rows![i - 1].mine != r.mine))
                  Padding(
                    padding: EdgeInsets.only(bottom: 8, top: i == 0 ? 0 : 8),
                    child: Text(
                      r.mine
                          ? 'Assigned to me (${_rows!.where((x) => x.mine).length})'
                          : 'Rest of the team (${_rows!.where((x) => !x.mine).length})',
                      style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5, color: r.mine ? _teal : _muted),
                    ),
                  ),
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
                            borderRadius: BorderRadius.circular(12), border: Border.all(color: _cardEdge)),
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
                                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: _muted),
                                  ),
                                  if (_packed && r.packedAt != null)
                                    Text('Packed by ${r.packedBy.isEmpty ? '—' : r.packedBy} · ${fmt.format(r.packedAt!)}',
                                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: _packedGreen)),
                                  if (!_packed && !r.mine)
                                    Text(r.assignedTo.isEmpty ? 'Not assigned' : 'Assigned to ${r.assignedTo}',
                                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: _assigned)),
                                ],
                              ),
                            ),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text('${r.ticked}/${r.items}',
                                    style: TextStyle(
                                        fontWeight: FontWeight.w800,
                                        fontSize: 16,
                                        color: _packed ? _packedGreen : (r.started ? _inProgress : _ink))),
                                Text(
                                  _packed ? 'packed' : (r.started ? 'being packed' : 'not started'),
                                  style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600,
                                      color: _packed ? _packedGreen : (r.started ? _inProgress : _muted)),
                                ),
                              ],
                            ),
                            const SizedBox(width: 4),
                            const Icon(Icons.chevron_right, color: _muted),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
          ],
        ),
      ),
    );
  }
}
