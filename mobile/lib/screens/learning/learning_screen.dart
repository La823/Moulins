import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../models/learning.dart';
import '../../models/product.dart';
import '../../providers/auth_provider.dart';
import '../../services/learning_service.dart';
import '../../services/product_service.dart';
import '../../widgets/notification_bell_button.dart';
import '../../widgets/chat_button.dart';
import '../../widgets/profile_button.dart';
import '../../utils/responsive.dart';
import '../../widgets/app_drawer.dart';

const _teal = Color(0xFF00A6A4);

class LearningScreen extends ConsumerStatefulWidget {
  const LearningScreen({super.key});

  @override
  ConsumerState<LearningScreen> createState() => _LearningScreenState();
}

class _LearningScreenState extends ConsumerState<LearningScreen> {
  static const teal = _teal;
  final _service = LearningService();
  final _searchCtrl = TextEditingController();

  List<LearningVideo> _videos = [];
  List<LearningPlaylist> _playlists = [];
  String? _activePlaylist;
  bool _loading = true;

  bool get _isAdmin {
    final role = ref.read(authProvider).user?.role;
    return role == 'admin' || role == 'employee';
  }

  @override
  void initState() {
    super.initState();
    _service.getPlaylists().then((p) {
      if (mounted) setState(() => _playlists = p);
    }).catchError((_) {});
    _load();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  // Embedding YouTube inside a WebView proved unreliable — YouTube
  // increasingly rejects non-browser embedded clients regardless of the
  // video's own settings, so playback opens the real YouTube app/browser
  // instead, which is always reliable.
  Future<void> _openVideo(LearningVideo v) async {
    try {
      final launched = await launchUrl(Uri.parse(v.youtubeUrl), mode: LaunchMode.externalApplication);
      if (!launched && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not open video')));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not open video')));
      }
    }
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final videos = await _service.getVideos(search: _searchCtrl.text.trim(), playlistId: _activePlaylist);
      setState(() { _videos = videos; _loading = false; });
    } catch (_) {
      setState(() { _videos = []; _loading = false; });
    }
  }

  void _openAddVideoSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _AddVideoSheet(playlists: _playlists, onAdded: _load),
    );
  }

  Future<void> _deleteVideo(LearningVideo v) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete video?'),
        content: Text('"${v.title}" will be removed permanently.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete', style: TextStyle(color: Colors.red))),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await _service.deleteVideo(v.id);
      _load();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not delete video')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      drawer: const AppDrawer(),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('Learning', style: TextStyle(color: Color(0xFF1A1A1A), fontWeight: FontWeight.w600)),
        actions: const [ChatButton(), NotificationBellButton(), ProfileButton(), SizedBox(width: 4)],
      ),
      floatingActionButton: _isAdmin
          ? FloatingActionButton(
              backgroundColor: teal,
              onPressed: _openAddVideoSheet,
              child: const Icon(Icons.add, color: Colors.white),
            )
          : null,
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: TextField(
              controller: _searchCtrl,
              onChanged: (_) => _load(),
              decoration: InputDecoration(
                hintText: 'Search videos...',
                prefixIcon: const Icon(Icons.search, color: Colors.grey),
                filled: true,
                fillColor: Colors.grey.shade50,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade200)),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade200)),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: teal)),
                contentPadding: const EdgeInsets.symmetric(vertical: 0),
              ),
            ),
          ),

          if (_playlists.isNotEmpty)
            SizedBox(
              height: 44,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                children: [
                  _chip('All Videos', _activePlaylist == null, () {
                    setState(() => _activePlaylist = null);
                    _load();
                  }),
                  ..._playlists.map((p) => _chip(p.title, _activePlaylist == p.id, () {
                        setState(() => _activePlaylist = p.id);
                        _load();
                      })),
                ],
              ),
            ),

          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: teal))
                : _videos.isEmpty
                    ? Center(child: Text('No videos found', style: TextStyle(color: Colors.grey.shade400)))
                    : GridView.builder(
                        padding: const EdgeInsets.all(16),
                        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: responsiveGridColumns(context),
                          childAspectRatio: 0.85,
                          crossAxisSpacing: 12,
                          mainAxisSpacing: 12,
                        ),
                        itemCount: _videos.length,
                        itemBuilder: (ctx, i) {
                          final v = _videos[i];
                          return GestureDetector(
                            onTap: () => _openVideo(v),
                            onLongPress: _isAdmin ? () => _deleteVideo(v) : null,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: ClipRRect(
                                    borderRadius: BorderRadius.circular(10),
                                    child: Stack(
                                      children: [
                                        SizedBox(
                                          width: double.infinity,
                                          height: double.infinity,
                                          child: CachedNetworkImage(
                                            imageUrl: v.thumbnailUrl,
                                            fit: BoxFit.cover,
                                            placeholder: (_, __) => Container(color: Colors.grey.shade100),
                                            errorWidget: (_, __, ___) => Container(color: Colors.grey.shade100, child: const Icon(Icons.ondemand_video, color: Colors.grey)),
                                          ),
                                        ),
                                        const Positioned.fill(
                                          child: Center(
                                            child: Icon(Icons.play_circle_fill, color: Colors.white, size: 36, shadows: [Shadow(color: Colors.black45, blurRadius: 8)]),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text(v.title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF1A1A1A)), maxLines: 2, overflow: TextOverflow.ellipsis),
                                if (_isAdmin)
                                  Text('Hold to delete', style: TextStyle(fontSize: 10, color: Colors.grey.shade400)),
                              ],
                            ),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }

  Widget _chip(String label, bool selected, VoidCallback onTap) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            decoration: BoxDecoration(
              color: selected ? teal : Colors.grey.shade100,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(label, style: TextStyle(fontSize: 13, color: selected ? Colors.white : Colors.grey.shade700, fontWeight: selected ? FontWeight.w600 : FontWeight.normal)),
          ),
        ),
      );
}

// Bottom sheet shown to admins/employees to add a new learning video —
// mirrors the website admin panel's "Add Video" form (YouTube link + a
// required linked product, broadcast to every customer on save).
class _AddVideoSheet extends StatefulWidget {
  final List<LearningPlaylist> playlists;
  final VoidCallback onAdded;

  const _AddVideoSheet({required this.playlists, required this.onAdded});

  @override
  State<_AddVideoSheet> createState() => _AddVideoSheetState();
}

class _AddVideoSheetState extends State<_AddVideoSheet> {
  final _urlCtrl = TextEditingController();
  final _titleCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  final _productSearchCtrl = TextEditingController();

  String? _playlistId;
  Product? _selectedProduct;
  List<Product> _productResults = [];
  bool _searchingProducts = false;
  bool _submitting = false;
  String? _error;

  Future<void> _searchProducts(String query) async {
    setState(() => _searchingProducts = true);
    try {
      final res = await ProductService().getProducts(search: query, limit: 20);
      if (mounted) setState(() { _productResults = res.products; _searchingProducts = false; });
    } catch (_) {
      if (mounted) setState(() => _searchingProducts = false);
    }
  }

  Future<void> _submit() async {
    if (_urlCtrl.text.trim().isEmpty || _titleCtrl.text.trim().isEmpty) {
      setState(() => _error = 'YouTube link and title are required');
      return;
    }
    if (_selectedProduct == null) {
      setState(() => _error = 'Please link a product to this video');
      return;
    }
    setState(() { _submitting = true; _error = null; });
    try {
      await LearningService().createVideo(
        youtubeUrl: _urlCtrl.text.trim(),
        title: _titleCtrl.text.trim(),
        description: _descCtrl.text.trim(),
        playlistId: _playlistId,
        productId: _selectedProduct!.id,
      );
      if (mounted) {
        Navigator.pop(context);
        widget.onAdded();
      }
    } catch (e) {
      setState(() => _error = 'Could not add video');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Add Video', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),
            TextField(
              controller: _urlCtrl,
              decoration: InputDecoration(
                labelText: 'YouTube link',
                filled: true,
                fillColor: Colors.grey.shade50,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _titleCtrl,
              decoration: InputDecoration(
                labelText: 'Title',
                filled: true,
                fillColor: Colors.grey.shade50,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _descCtrl,
              maxLines: 2,
              decoration: InputDecoration(
                labelText: 'Description (optional)',
                filled: true,
                fillColor: Colors.grey.shade50,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _productSearchCtrl,
              decoration: InputDecoration(
                labelText: 'Link a product *',
                filled: true,
                fillColor: _selectedProduct != null ? Colors.green.shade50 : Colors.grey.shade50,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
              ),
              onChanged: (v) {
                _selectedProduct = null;
                _searchProducts(v);
              },
            ),
            if (_searchingProducts)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: LinearProgressIndicator(color: _teal),
              )
            else if (_productResults.isNotEmpty && _selectedProduct == null)
              Container(
                margin: const EdgeInsets.only(top: 6),
                constraints: const BoxConstraints(maxHeight: 180),
                decoration: BoxDecoration(
                  border: Border.all(color: Colors.grey.shade200),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: _productResults.length,
                  itemBuilder: (ctx, i) {
                    final p = _productResults[i];
                    return ListTile(
                      dense: true,
                      title: Text(p.name, style: const TextStyle(fontSize: 13)),
                      onTap: () => setState(() {
                        _selectedProduct = p;
                        _productSearchCtrl.text = p.name;
                        _productResults = [];
                      }),
                    );
                  },
                ),
              ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _playlistId,
              decoration: InputDecoration(
                labelText: 'Playlist (optional)',
                filled: true,
                fillColor: Colors.grey.shade50,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
              ),
              items: widget.playlists
                  .map((p) => DropdownMenuItem(value: p.id, child: Text(p.title, overflow: TextOverflow.ellipsis)))
                  .toList(),
              onChanged: (v) => setState(() => _playlistId = v),
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 12.5)),
            ],
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: _submitting ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: _teal,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  elevation: 0,
                ),
                child: _submitting
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Add & Broadcast'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
