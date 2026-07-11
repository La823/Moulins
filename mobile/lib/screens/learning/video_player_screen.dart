import 'dart:async';
import 'package:flutter/material.dart';
import 'package:youtube_player_iframe/youtube_player_iframe.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../models/learning.dart';

class VideoPlayerScreen extends StatefulWidget {
  final LearningVideo video;
  const VideoPlayerScreen({super.key, required this.video});

  @override
  State<VideoPlayerScreen> createState() => _VideoPlayerScreenState();
}

class _VideoPlayerScreenState extends State<VideoPlayerScreen> {
  static const teal = Color(0xFF00A6A4);
  late final YoutubePlayerController _controller;
  StreamSubscription? _sub;
  Timer? _stallTimer;
  bool _ready = false;
  bool _webviewError = false;

  @override
  void initState() {
    super.initState();
    _controller = YoutubePlayerController(
      params: const YoutubePlayerParams(showFullscreenButton: true, mute: false),
      onWebResourceError: (err) {
        if (mounted) setState(() => _webviewError = true);
      },
    );
    _controller.loadVideoById(videoId: widget.video.youtubeId);

    // The embedded player can silently fail to reach "ready"/"playing" on
    // some devices (outdated system WebView, restrictive network). If we
    // don't see any playback state change within a few seconds, offer a
    // direct escape hatch to the YouTube app/browser instead of leaving a
    // dead black box on screen.
    _sub = _controller.stream.listen((value) {
      // unStarted already proves the iframe loaded and the JS bridge is
      // talking back to Flutter (autoplay may still be paused pending a
      // user tap, which is fine) — only "unknown" forever means it's stuck.
      if (!_ready && value.playerState != PlayerState.unknown) {
        setState(() => _ready = true);
        _stallTimer?.cancel();
      }
    });
    _stallTimer = Timer(const Duration(seconds: 8), () {
      if (mounted && !_ready) setState(() => _webviewError = true);
    });
  }

  @override
  void dispose() {
    _stallTimer?.cancel();
    _sub?.cancel();
    _controller.close();
    super.dispose();
  }

  Future<void> _openExternally() async {
    final uri = Uri.parse(widget.video.youtubeUrl);
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not open YouTube')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(widget.video.title, style: const TextStyle(fontSize: 15), maxLines: 1, overflow: TextOverflow.ellipsis),
      ),
      body: Column(
        children: [
          AspectRatio(
            aspectRatio: 16 / 9,
            child: Stack(
              alignment: Alignment.center,
              children: [
                YoutubePlayer(controller: _controller, aspectRatio: 16 / 9),
                if (!_ready && !_webviewError) const CircularProgressIndicator(color: teal),
                if (_webviewError)
                  Container(
                    color: Colors.black,
                    child: Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.error_outline, color: Colors.white54, size: 36),
                          const SizedBox(height: 10),
                          const Text("Couldn't load the player", style: TextStyle(color: Colors.white70, fontSize: 13)),
                          const SizedBox(height: 12),
                          ElevatedButton.icon(
                            onPressed: _openExternally,
                            icon: const Icon(Icons.open_in_new, size: 16),
                            label: const Text('Open in YouTube'),
                            style: ElevatedButton.styleFrom(backgroundColor: teal, foregroundColor: Colors.white),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: _openExternally,
                icon: const Icon(Icons.open_in_new, size: 14, color: teal),
                label: const Text('Open in YouTube app', style: TextStyle(color: teal, fontSize: 12)),
              ),
            ),
          ),
          if (widget.video.description != null && widget.video.description!.isNotEmpty)
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(
                  widget.video.description!,
                  style: const TextStyle(color: Colors.white70, fontSize: 13, height: 1.5),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
