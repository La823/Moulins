import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/chat_message.dart';
import '../../services/chat_service.dart';
import 'chat_thread_screen.dart';

class ChatListScreen extends ConsumerStatefulWidget {
  const ChatListScreen({super.key});

  @override
  ConsumerState<ChatListScreen> createState() => _ChatListScreenState();
}

class _ChatListScreenState extends ConsumerState<ChatListScreen> {
  static const teal = Color(0xFF00A6A4);
  final _service = ChatService();

  List<ChatConversation> _conversations = [];
  List<ChatContact> _contacts = [];
  bool _loading = true;
  bool _showContacts = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([_service.getConversations(), _service.getContacts()]);
      setState(() {
        _conversations = results[0] as List<ChatConversation>;
        _contacts = results[1] as List<ChatContact>;
      });
    } catch (_) {
      // keep whatever was loaded before
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _openThread(String userId, String displayName) {
    Navigator.of(context)
        .push(MaterialPageRoute(builder: (_) => ChatThreadScreen(otherUserId: userId, otherUserName: displayName)))
        .then((_) => _load());
  }

  @override
  Widget build(BuildContext context) {
    final conversationIds = _conversations.map((c) => c.userId).toSet();
    final newContacts = _contacts.where((c) => !conversationIds.contains(c.id)).toList();

    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('Messages', style: TextStyle(color: Color(0xFF1A1A1A), fontWeight: FontWeight.w600)),
        actions: [
          IconButton(
            icon: Icon(_showContacts ? Icons.close : Icons.add_comment_outlined, color: teal),
            onPressed: () => setState(() => _showContacts = !_showContacts),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: teal))
          : RefreshIndicator(
              onRefresh: _load,
              color: teal,
              child: ListView(
                children: [
                  if (_showContacts) ...[
                    Container(
                      color: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                      child: const Text('Start a new chat', style: TextStyle(fontSize: 12, color: Colors.grey, fontWeight: FontWeight.w600)),
                    ),
                    if (newContacts.isEmpty)
                      Container(
                        color: Colors.white,
                        padding: const EdgeInsets.all(16),
                        child: Text('No contacts available', style: TextStyle(color: Colors.grey.shade400, fontSize: 13)),
                      )
                    else
                      ...newContacts.map((c) => Container(
                            color: Colors.white,
                            child: ListTile(
                              leading: CircleAvatar(
                                backgroundColor: teal.withValues(alpha: 0.15),
                                child: Text(c.displayName.isNotEmpty ? c.displayName[0].toUpperCase() : '?', style: const TextStyle(color: teal, fontWeight: FontWeight.bold)),
                              ),
                              title: Text(c.displayName, style: const TextStyle(fontWeight: FontWeight.w500)),
                              subtitle: Text(c.role, style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                              onTap: () {
                                setState(() => _showContacts = false);
                                _openThread(c.id, c.displayName);
                              },
                            ),
                          )),
                    const Divider(height: 1),
                  ],
                  if (_conversations.isEmpty && !_showContacts)
                    Padding(
                      padding: const EdgeInsets.only(top: 80),
                      child: Center(child: Text('No conversations yet', style: TextStyle(color: Colors.grey.shade400))),
                    )
                  else
                    ..._conversations.map((c) => Container(
                          color: Colors.white,
                          child: ListTile(
                            leading: CircleAvatar(
                              backgroundColor: teal.withValues(alpha: 0.15),
                              child: Text(c.displayName.isNotEmpty ? c.displayName[0].toUpperCase() : '?', style: const TextStyle(color: teal, fontWeight: FontWeight.bold)),
                            ),
                            title: Text(c.displayName, style: const TextStyle(fontWeight: FontWeight.w500)),
                            subtitle: Text(c.lastMessage, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, color: Colors.grey.shade500)),
                            trailing: c.unreadCount > 0
                                ? Container(
                                    padding: const EdgeInsets.all(6),
                                    decoration: const BoxDecoration(color: teal, shape: BoxShape.circle),
                                    child: Text('${c.unreadCount}', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                                  )
                                : null,
                            onTap: () => _openThread(c.userId, c.displayName),
                          ),
                        )),
                ],
              ),
            ),
    );
  }
}
