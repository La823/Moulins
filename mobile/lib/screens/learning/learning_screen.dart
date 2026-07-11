import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../models/learning.dart';
import '../../services/learning_service.dart';
import '../../widgets/notification_bell_button.dart';
import '../../widgets/chat_button.dart';
import '../../widgets/profile_button.dart';
import 'video_player_screen.dart';

class LearningScreen extends StatefulWidget {
  const LearningScreen({super.key});

  @override
  State<LearningScreen> createState() => _LearningScreenState();
}

class _LearningScreenState extends State<LearningScreen> {
  static const teal = Color(0xFF00A6A4);
  final _service = LearningService();
  final _searchCtrl = TextEditingController();

  List<LearningVideo> _videos = [];
  List<LearningPlaylist> _playlists = [];
  String? _activePlaylist;
  bool _loading = true;

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

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final videos = await _service.getVideos(search: _searchCtrl.text.trim(), playlistId: _activePlaylist);
      setState(() { _videos = videos; _loading = false; });
    } catch (_) {
      setState(() { _videos = []; _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('Learning', style: TextStyle(color: Color(0xFF1A1A1A), fontWeight: FontWeight.w600)),
        actions: const [ChatButton(), NotificationBellButton(), ProfileButton(), SizedBox(width: 4)],
      ),
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
                        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          childAspectRatio: 0.85,
                          crossAxisSpacing: 12,
                          mainAxisSpacing: 12,
                        ),
                        itemCount: _videos.length,
                        itemBuilder: (ctx, i) {
                          final v = _videos[i];
                          return GestureDetector(
                            onTap: () => Navigator.of(context).push(
                              MaterialPageRoute(builder: (_) => VideoPlayerScreen(video: v)),
                            ),
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
