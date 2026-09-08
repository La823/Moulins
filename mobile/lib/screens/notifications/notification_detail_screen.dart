import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../models/notification_item.dart';

const _teal = Color(0xFF00A6A4);
const _ink = Color(0xFF1A1A1A);

// Full detail view for a single notification — the list screen previously
// either jumped straight to a deep link or, for image-only notifications,
// opened a bare fullscreen image with no title/body visible at all. This
// gives every notification a proper page: title, body, and (if present) the
// image, which is itself tappable to open at full size.
class NotificationDetailScreen extends StatelessWidget {
  final NotificationItem item;
  const NotificationDetailScreen({super.key, required this.item});

  void _openFullImage(BuildContext context) {
    showDialog(
      context: context,
      barrierColor: Colors.black,
      builder: (ctx) => GestureDetector(
        onTap: () => Navigator.of(ctx).pop(),
        child: Scaffold(
          backgroundColor: Colors.black,
          appBar: AppBar(
            backgroundColor: Colors.black,
            iconTheme: const IconThemeData(color: Colors.white),
            elevation: 0,
          ),
          body: Center(
            child: InteractiveViewer(
              minScale: 0.5,
              maxScale: 4,
              child: Image.network(item.imageUrl!, fit: BoxFit.contain),
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final hasImage = item.imageUrl != null && item.imageUrl!.isNotEmpty;
    final hasDeepLink = item.deepLink != null && item.deepLink!.isNotEmpty;

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('Notification', style: TextStyle(color: _ink, fontWeight: FontWeight.w600)),
      ),
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (hasImage)
              GestureDetector(
                onTap: () => _openFullImage(context),
                child: Stack(
                  alignment: Alignment.bottomRight,
                  children: [
                    ColoredBox(
                      color: Colors.grey.shade100,
                      child: Image.network(
                        item.imageUrl!,
                        width: double.infinity,
                        fit: BoxFit.fitWidth,
                        loadingBuilder: (ctx, child, progress) {
                          if (progress == null) return child;
                          return const SizedBox(
                            height: 220,
                            child: Center(child: CircularProgressIndicator(color: _teal)),
                          );
                        },
                        errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                      ),
                    ),
                    Container(
                      margin: const EdgeInsets.all(10),
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.55), borderRadius: BorderRadius.circular(8)),
                      child: const Icon(Icons.fullscreen, color: Colors.white, size: 18),
                    ),
                  ],
                ),
              ),
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: _ink, height: 1.3)),
                  const SizedBox(height: 8),
                  Text(
                    DateFormat('MMM d, yyyy · h:mm a').format(item.createdAt),
                    style: TextStyle(fontSize: 12.5, color: Colors.grey.shade400),
                  ),
                  const SizedBox(height: 18),
                  Text(item.body, style: TextStyle(fontSize: 15, color: Colors.grey.shade700, height: 1.55)),
                  if (hasDeepLink) ...[
                    const SizedBox(height: 28),
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: ElevatedButton(
                        onPressed: () => context.push(item.deepLink!),
                        style: ElevatedButton.styleFrom(backgroundColor: _teal, foregroundColor: Colors.white),
                        child: const Text('Open'),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
