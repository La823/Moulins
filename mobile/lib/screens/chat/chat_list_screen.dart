import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/chat_message.dart';
import '../../providers/auth_provider.dart';
import '../../services/chat_service.dart';
import 'chat_thread_screen.dart';
import '../../utils/responsive.dart';
import '../../widgets/app_drawer.dart';

class ChatListScreen extends ConsumerStatefulWidget {
  const ChatListScreen({super.key});

  @override
  ConsumerState<ChatListScreen> createState() => _ChatListScreenState();
}

class _ChatListScreenState extends ConsumerState<ChatListScreen> {
  static const teal = Color(0xFF00A6A4);
  final _service = ChatService();
  final _searchCtrl = TextEditingController();
  late final ChatSocket _socket;

  List<ChatConversation> _conversations = [];
  List<ChatContact> _contacts = [];
  bool _loading = true;
  bool _showContacts = false;
  String _search = '';

  @override
  void initState() {
    super.initState();
    _load();
    // Keep the list live while it's open — otherwise a new message only
    // shows up after a manual pull-to-refresh, even though the push
    // notification for it already arrived.
    _socket = ChatSocket(onMessage: (_) => _load(showSpinner: false));
    _socket.connect();
  }

  @override
  void dispose() {
    _socket.dispose();
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _load({bool showSpinner = true}) async {
    if (showSpinner) setState(() => _loading = true);
    try {
      final results = await Future.wait([_service.getConversations(), _service.getContacts()]);
      if (!mounted) return;
      setState(() {
        _conversations = results[0] as List<ChatConversation>;
        _contacts = results[1] as List<ChatContact>;
      });
    } catch (_) {
      // keep whatever was loaded before
    } finally {
      if (mounted && showSpinner) setState(() => _loading = false);
    }
  }

  // Conversation-list name color: black for group threads, green for a
  // direct chat with an admin, blue for a direct chat with an employee.
  Color _nameColor(ChatConversation c) {
    if (c.isThread) return const Color(0xFF1A1A1A);
    if (c.role == 'admin') return Colors.green.shade700;
    if (c.role == 'employee') return Colors.blue.shade700;
    return const Color(0xFF1A1A1A);
  }

  void _openThread({required String id, required bool isThread, required String displayName}) {
    Navigator.of(context)
        .push(MaterialPageRoute(builder: (_) => ChatThreadScreen(id: id, isThread: isThread, title: displayName)))
        .then((_) => _load());
  }

  @override
  Widget build(BuildContext context) {
    final myId = ref.watch(authProvider).user?.id;
    // Only direct conversations correspond 1:1 to a raw contact id — thread
    // conversations don't, so they're excluded from this dedup set.
    final directIds = _conversations.where((c) => !c.isThread).map((c) => c.id).toSet();
    final newContacts = _contacts.where((c) => !directIds.contains(c.id)).toList();
    final filteredConversations = _search.isEmpty
        ? _conversations
        : _conversations.where((c) => c.labelFor(myId).toLowerCase().contains(_search.toLowerCase())).toList();

    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      drawer: const AppDrawer(),
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
      body: ResponsiveCenter(child: _loading
          ? const Center(child: CircularProgressIndicator(color: teal))
          : RefreshIndicator(
              onRefresh: _load,
              color: teal,
              child: ListView(
                children: [
                  Container(
                    color: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    child: TextField(
                      controller: _searchCtrl,
                      onChanged: (v) => setState(() => _search = v),
                      decoration: InputDecoration(
                        hintText: 'Search chats...',
                        prefixIcon: const Icon(Icons.search, color: Colors.grey, size: 20),
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(vertical: 10),
                        filled: true,
                        fillColor: Colors.grey.shade100,
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                      ),
                    ),
                  ),
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
                                _openThread(id: c.id, isThread: false, displayName: c.displayName);
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
                  else if (filteredConversations.isEmpty && !_showContacts)
                    Padding(
                      padding: const EdgeInsets.only(top: 80),
                      child: Center(child: Text('No chats match "$_search"', style: TextStyle(color: Colors.grey.shade400))),
                    )
                  else
                    ...filteredConversations.map((c) {
                      final label = c.labelFor(myId);
                      return Container(
                          color: Colors.white,
                          child: ListTile(
                            leading: CircleAvatar(
                              backgroundColor: teal.withValues(alpha: 0.15),
                              child: Text(label.isNotEmpty ? label[0].toUpperCase() : '?', style: const TextStyle(color: teal, fontWeight: FontWeight.bold)),
                            ),
                            title: Text(label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: _nameColor(c))),
                            subtitle: Text(c.lastMessage, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, color: Colors.grey.shade500)),
                            trailing: c.unreadCount > 0
                                ? Container(
                                    padding: const EdgeInsets.all(6),
                                    decoration: const BoxDecoration(color: teal, shape: BoxShape.circle),
                                    child: Text('${c.unreadCount}', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                                  )
                                : null,
                            onTap: () => _openThread(id: c.id, isThread: c.isThread, displayName: label),
                          ),
                        );
                    }),
                ],
              ),
            ),
      ),
    );
  }
}
