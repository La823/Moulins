import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/auth_provider.dart';

/// Top-right icon that opens the chat inbox, placed alongside
/// NotificationBellButton on every top-level tab. Not shown to retailers,
/// who have no chat.
class ChatButton extends ConsumerWidget {
  const ChatButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (ref.watch(authProvider).user?.role == 'retailer') return const SizedBox.shrink();
    return IconButton(
      icon: const Icon(Icons.chat_bubble_outline, color: Color(0xFF1A1A1A)),
      onPressed: () => context.push('/chat'),
      tooltip: 'Messages',
    );
  }
}
