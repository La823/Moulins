import 'package:flutter/material.dart';
import '../screens/presentations/present.dart';
import '../services/presentation_downloads.dart';
import '../services/presentation_service.dart';

/// Download button for one presentation, used wherever a deck is shown (My
/// Presentations, a doctor's presentations, the presentation itself).
/// Not downloaded: tap to save it on the phone, with a progress ring.
/// Downloaded: a tick; tap to present the saved copy, update it or remove
/// it. Every button reflects downloads made elsewhere in the app, through
/// [PresentationDownloads.changes].
class PresentationDownloadButton extends StatefulWidget {
  final String presentationId;
  final String name;

  /// Round white button for laying over a card's preview; otherwise a plain
  /// icon button (app bars, list rows).
  final bool overlay;

  /// With no internet a deck can't be downloaded or updated, only presented
  /// or removed.
  final bool offline;

  const PresentationDownloadButton({
    super.key,
    required this.presentationId,
    required this.name,
    this.overlay = false,
    this.offline = false,
  });

  @override
  State<PresentationDownloadButton> createState() => _PresentationDownloadButtonState();
}

class _PresentationDownloadButtonState extends State<PresentationDownloadButton> {
  static const _teal = Color(0xFF00A6A4);
  DownloadedPresentation? _saved;
  double? _progress; // 0..1 while downloading

  @override
  void initState() {
    super.initState();
    PresentationDownloads.changes.addListener(_refresh);
    _refresh();
  }

  @override
  void didUpdateWidget(PresentationDownloadButton old) {
    super.didUpdateWidget(old);
    if (old.presentationId != widget.presentationId) _refresh();
  }

  @override
  void dispose() {
    PresentationDownloads.changes.removeListener(_refresh);
    super.dispose();
  }

  Future<void> _refresh() async {
    final d = await PresentationDownloads.get(widget.presentationId);
    if (mounted) setState(() => _saved = d);
  }

  void _snack(String text, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(text),
      backgroundColor: error ? Colors.red : null,
      behavior: SnackBarBehavior.floating,
    ));
  }

  Future<void> _download() async {
    if (_progress != null) return;
    setState(() => _progress = 0);
    try {
      final detail = await PresentationService().getPresentation(widget.presentationId);
      if (detail.slides.isEmpty) {
        _snack('"${widget.name}" has no slides to download yet.');
        return;
      }
      await PresentationDownloads.download(detail, onProgress: (done, total) {
        if (mounted && total > 0) setState(() => _progress = done / total);
      });
      _snack('"${widget.name}" has been downloaded and will open without an internet connection.');
    } catch (_) {
      _snack('"${widget.name}" could not be downloaded. Please check your internet connection and try again.',
          error: true);
    } finally {
      if (mounted) setState(() => _progress = null);
    }
  }

  Future<void> _present() async {
    final d = _saved;
    if (d == null) return;
    if (!await PresentationDownloads.isComplete(d)) {
      _snack(widget.offline
          ? 'Some slides of "${d.name}" are no longer on this phone. Please download it again when online.'
          : 'Some slides are missing on this phone; they will load from the internet.');
      if (widget.offline) return;
    }
    final notebook = await notebookPreferred();
    if (mounted) presentSlides(context, d.slides, notebook: notebook);
  }

  static String _ago(DateTime t) {
    final days = DateTime.now().difference(t).inDays;
    if (days <= 0) return 'today';
    if (days == 1) return 'yesterday';
    return '$days days ago';
  }

  Future<void> _menu() async {
    final d = _saved;
    if (d == null) return;
    final choice = await showModalBottomSheet<String>(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: Text(d.name, style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text(
                  'Downloaded ${_ago(d.downloadedAt)} · ${d.slides.length} slide${d.slides.length != 1 ? 's' : ''}'),
            ),
            ListTile(
              leading: const Icon(Icons.play_circle_outline, color: _teal),
              title: const Text('Present downloaded copy'),
              onTap: () => Navigator.pop(ctx, 'present'),
            ),
            if (!widget.offline)
              ListTile(
                leading: const Icon(Icons.sync),
                title: const Text('Update download'),
                subtitle: const Text('After slides have been added or changed'),
                onTap: () => Navigator.pop(ctx, 'update'),
              ),
            ListTile(
              leading: const Icon(Icons.delete_outline, color: Colors.red),
              title: const Text('Remove download', style: TextStyle(color: Colors.red)),
              onTap: () => Navigator.pop(ctx, 'remove'),
            ),
          ],
        ),
      ),
    );
    if (choice == 'present') await _present();
    if (choice == 'update') await _download();
    if (choice == 'remove') {
      await PresentationDownloads.remove(widget.presentationId);
      _snack('The download has been removed.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final downloading = _progress != null;
    final Widget icon = downloading
        ? SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(strokeWidth: 2.2, value: _progress! > 0 ? _progress : null, color: _teal),
          )
        : _saved != null
            ? const Icon(Icons.download_done, size: 20, color: _teal)
            : Icon(Icons.download_outlined, size: 20, color: widget.overlay ? Colors.grey.shade700 : _teal);
    final VoidCallback? onTap = downloading
        ? null
        : _saved != null
            ? _menu
            : (widget.offline ? null : _download);
    final tooltip = _saved != null ? 'Downloaded' : 'Download for offline use';

    if (!widget.overlay) {
      return IconButton(icon: icon, tooltip: tooltip, onPressed: onTap);
    }
    return Tooltip(
      message: tooltip,
      child: Material(
        color: Colors.white.withValues(alpha: 0.92),
        shape: const CircleBorder(),
        elevation: 1,
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: Padding(padding: const EdgeInsets.all(7), child: icon),
        ),
      ),
    );
  }
}
