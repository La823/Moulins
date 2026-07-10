import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Top-right icon that opens the chat inbox, placed alongside
/// NotificationBellButton on every top-level tab.
class ChatButton extends StatelessWidget {
  const ChatButton({super.key});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: const Icon(Icons.chat_bubble_outline, color: Color(0xFF1A1A1A)),
      onPressed: () => context.push('/chat'),
      tooltip: 'Messages',
    );
  }
}
