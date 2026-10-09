import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

/// A bundled video that plays once, muted, as soon as it's ready and then
/// rests on its last frame — the same behaviour as the website's hero and
/// login videos (`autoPlay muted playsInline`, no loop).
///
/// [poster] (an asset image) is shown until the first frame is ready, so
/// there's no blank flash while the video loads. [fit] works like an image's
/// BoxFit: cover fills and crops, contain letterboxes.
class PlayOnceVideo extends StatefulWidget {
  final String asset;
  final String? poster;
  final BoxFit fit;
  final Alignment alignment;
  final Color background;

  const PlayOnceVideo({
    super.key,
    required this.asset,
    this.poster,
    this.fit = BoxFit.cover,
    this.alignment = Alignment.center,
    this.background = Colors.white,
  });

  @override
  State<PlayOnceVideo> createState() => _PlayOnceVideoState();
}

class _PlayOnceVideoState extends State<PlayOnceVideo> {
  late final VideoPlayerController _controller;
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _controller = VideoPlayerController.asset(
      widget.asset,
      // Don't interrupt whatever the user is listening to — the clips are silent.
      videoPlayerOptions: VideoPlayerOptions(mixWithOthers: true),
    );
    _controller.initialize().then((_) {
      if (!mounted) return;
      _controller
        ..setVolume(0)
        ..setLooping(false)
        ..play();
      setState(() => _ready = true);
    }).catchError((_) {
      // Leave the poster up if the video can't be decoded on this device.
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final poster = widget.poster == null
        ? ColoredBox(color: widget.background)
        : Image.asset(widget.poster!, fit: widget.fit, alignment: widget.alignment);

    return ColoredBox(
      color: widget.background,
      child: SizedBox.expand(
        child: !_ready
            ? poster
            : ClipRect(
                child: FittedBox(
                  fit: widget.fit,
                  alignment: widget.alignment,
                  child: SizedBox(
                    width: _controller.value.size.width,
                    height: _controller.value.size.height,
                    child: VideoPlayer(_controller),
                  ),
                ),
              ),
      ),
    );
  }
}
