import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../models/notification_item.dart';
import '../../providers/notification_provider.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(notificationsProvider.notifier).load());
  }

  void _onTap(NotificationItem n) {
    if (!n.isRead) {
      ref.read(notificationsProvider.notifier).markAsRead(n.recipientId);
    }
    if (n.deepLink != null && n.deepLink!.isNotEmpty) {
      context.push(n.deepLink!);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(notificationsProvider);

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('Notifications', style: TextStyle(color: Color(0xFF1A1A1A), fontWeight: FontWeight.w600)),
      ),
      body: state.loading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF00A6A4)))
          : state.items.isEmpty
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.notifications_none, size: 64, color: Colors.grey.shade300),
                      const SizedBox(height: 16),
                      const Text('No notifications yet', style: TextStyle(color: Colors.grey, fontSize: 16)),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: () => ref.read(notificationsProvider.notifier).load(),
                  color: const Color(0xFF00A6A4),
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: state.items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (ctx, i) {
                      final n = state.items[i];
                      return InkWell(
                        onTap: () => _onTap(n),
                        borderRadius: BorderRadius.circular(12),
                        child: Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: n.isRead ? Colors.white : const Color(0xFF00A6A4).withValues(alpha: 0.06),
                            border: Border.all(color: Colors.grey.shade200),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (n.imageUrl != null && n.imageUrl!.isNotEmpty)
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(8),
                                  child: Image.network(n.imageUrl!, width: 48, height: 48, fit: BoxFit.cover),
                                )
                              else
                                Container(
                                  width: 48,
                                  height: 48,
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF00A6A4).withValues(alpha: 0.1),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: const Icon(Icons.campaign_outlined, color: Color(0xFF00A6A4)),
                                ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(n.title,
                                        style: TextStyle(
                                            fontWeight: n.isRead ? FontWeight.w500 : FontWeight.w700,
                                            fontSize: 14,
                                            color: const Color(0xFF1A1A1A))),
                                    const SizedBox(height: 4),
                                    Text(n.body, style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
                                    const SizedBox(height: 6),
                                    Text(DateFormat('MMM d, h:mm a').format(n.createdAt),
                                        style: TextStyle(fontSize: 11, color: Colors.grey.shade400)),
                                  ],
                                ),
                              ),
                              if (!n.isRead)
                                Container(
                                  width: 8,
                                  height: 8,
                                  margin: const EdgeInsets.only(top: 4),
                                  decoration: const BoxDecoration(color: Color(0xFF00A6A4), shape: BoxShape.circle),
                                ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
    );
  }
}
