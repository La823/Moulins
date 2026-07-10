import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/auth_provider.dart';
import '../../models/chat_message.dart';
import '../../services/chat_service.dart';

class ChatThreadScreen extends ConsumerStatefulWidget {
  final String otherUserId;
  final String otherUserName;

  const ChatThreadScreen({super.key, required this.otherUserId, required this.otherUserName});

  @override
  ConsumerState<ChatThreadScreen> createState() => _ChatThreadScreenState();
}

class _ChatThreadScreenState extends ConsumerState<ChatThreadScreen> {
  static const teal = Color(0xFF00A6A4);
  final _service = ChatService();
  final _scrollCtrl = ScrollController();
  final _draftCtrl = TextEditingController();
  late final ChatSocket _socket;

  List<ChatMessage> _messages = [];
  bool _loading = true;
  bool _connected = false;

  @override
  void initState() {
    super.initState();
    _socket = ChatSocket(
      onMessage: _handleIncoming,
      onConnectionChanged: (c) {
        if (mounted) setState(() => _connected = c);
      },
    );
    _socket.connect();
    _loadHistory();
  }

  @override
  void dispose() {
    _socket.dispose();
    _scrollCtrl.dispose();
    _draftCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadHistory() async {
    try {
      final history = await _service.getHistory(widget.otherUserId);
      setState(() => _messages = history);
      _scrollToBottom();
    } catch (_) {
      // keep empty state
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _handleIncoming(ChatMessage msg) {
    final myId = ref.read(authProvider).user?.id;
    final otherId = msg.senderId == myId ? msg.receiverId : msg.senderId;
    if (otherId != widget.otherUserId) return;
    setState(() => _messages = [..._messages, msg]);
    _scrollToBottom();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(_scrollCtrl.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      }
    });
  }

  void _send() {
    final text = _draftCtrl.text.trim();
    if (text.isEmpty) return;
    final ok = _socket.send(widget.otherUserId, text);
    if (ok) _draftCtrl.clear();
  }

  @override
  Widget build(BuildContext context) {
    final myId = ref.watch(authProvider).user?.id;

    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: Text(widget.otherUserName, style: const TextStyle(color: Color(0xFF1A1A1A), fontWeight: FontWeight.w600)),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(18),
          child: Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Text(_connected ? 'Connected' : 'Connecting...', style: TextStyle(fontSize: 11, color: _connected ? teal : Colors.grey)),
          ),
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: teal))
                : _messages.isEmpty
                    ? Center(child: Text('No messages yet — say hello', style: TextStyle(color: Colors.grey.shade400)))
                    : ListView.builder(
                        controller: _scrollCtrl,
                        padding: const EdgeInsets.all(12),
                        itemCount: _messages.length,
                        itemBuilder: (context, i) {
                          final m = _messages[i];
                          final mine = m.senderId == myId;
                          return Align(
                            alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                            child: Container(
                              margin: const EdgeInsets.symmetric(vertical: 4),
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                              constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.72),
                              decoration: BoxDecoration(
                                color: mine ? teal : Colors.white,
                                borderRadius: BorderRadius.circular(16),
                                border: mine ? null : Border.all(color: Colors.grey.shade200),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(m.body, style: TextStyle(color: mine ? Colors.white : const Color(0xFF1A1A1A), fontSize: 14)),
                                  const SizedBox(height: 4),
                                  Text(
                                    '${m.createdAt.hour.toString().padLeft(2, '0')}:${m.createdAt.minute.toString().padLeft(2, '0')}',
                                    style: TextStyle(fontSize: 10, color: mine ? Colors.white70 : Colors.grey),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
          ),
          SafeArea(
            top: false,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: Colors.grey.shade200))),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _draftCtrl,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _send(),
                      decoration: InputDecoration(
                        hintText: 'Type a message...',
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide.none),
                        filled: true,
                        fillColor: Colors.grey.shade100,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton(
                    icon: const Icon(Icons.send, color: teal),
                    onPressed: _send,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
