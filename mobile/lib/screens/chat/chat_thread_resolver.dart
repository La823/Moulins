import 'package:flutter/material.dart';
import '../../providers/auth_provider.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/chat_service.dart';
import 'chat_thread_screen.dart';

const _teal = Color(0xFF00A6A4);

// Lets a route like /chat/:id (from a message-notification deep link) open
// straight into the right thread — chat_list_screen.dart otherwise only
// ever pushes ChatThreadScreen with a conversation object already in hand,
// and there's no GET-by-id endpoint, so this loads the conversation list
// and matches on id the same way the list screen does.
class ChatThreadResolver extends ConsumerStatefulWidget {
  final String id;
  const ChatThreadResolver({super.key, required this.id});

  @override
  ConsumerState<ChatThreadResolver> createState() => _ChatThreadResolverState();
}

class _ChatThreadResolverState extends ConsumerState<ChatThreadResolver> {
  bool _notFound = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final myId = ref.read(authProvider).user?.id;
      final conversations = await ChatService().getConversations();
      final match = conversations.where((c) => c.id == widget.id);
      if (!mounted) return;
      if (match.isEmpty) {
        setState(() => _notFound = true);
        return;
      }
      final c = match.first;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => ChatThreadScreen(id: c.id, isThread: c.isThread, title: c.labelFor(myId))),
      );
    } catch (_) {
      if (mounted) setState(() => _notFound = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_notFound) {
      return Scaffold(
        appBar: AppBar(title: const Text('Chat')),
        body: Center(child: Text('Conversation not found', style: TextStyle(color: Colors.grey.shade500))),
      );
    }
    return const Scaffold(body: Center(child: CircularProgressIndicator(color: _teal)));
  }
}
