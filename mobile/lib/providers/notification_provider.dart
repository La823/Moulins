import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/notification_item.dart';
import '../services/notification_service.dart';

final notificationServiceProvider = Provider((ref) => NotificationService());

class NotificationsState {
  final List<NotificationItem> items;
  final bool loading;

  const NotificationsState({this.items = const [], this.loading = false});

  int get unreadCount => items.where((n) => !n.isRead).length;

  NotificationsState copyWith({List<NotificationItem>? items, bool? loading}) =>
      NotificationsState(items: items ?? this.items, loading: loading ?? this.loading);
}

class NotificationsNotifier extends StateNotifier<NotificationsState> {
  final NotificationService _service;

  NotificationsNotifier(this._service) : super(const NotificationsState());

  Future<void> load() async {
    state = state.copyWith(loading: true);
    try {
      final res = await _service.getNotifications();
      state = state.copyWith(items: res.notifications, loading: false);
    } catch (_) {
      state = state.copyWith(loading: false);
    }
  }

  Future<void> markAsRead(String recipientId) async {
    try {
      await _service.markAsRead(recipientId);
      state = state.copyWith(
        items: [
          for (final n in state.items)
            if (n.recipientId == recipientId)
              NotificationItem(
                recipientId: n.recipientId,
                notificationId: n.notificationId,
                title: n.title,
                body: n.body,
                imageUrl: n.imageUrl,
                deepLink: n.deepLink,
                isRead: true,
                createdAt: n.createdAt,
              )
            else
              n,
        ],
      );
    } catch (_) {}
  }
}

final notificationsProvider =
    StateNotifierProvider<NotificationsNotifier, NotificationsState>((ref) {
  return NotificationsNotifier(ref.read(notificationServiceProvider));
});
