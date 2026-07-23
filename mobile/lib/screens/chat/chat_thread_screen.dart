import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../providers/auth_provider.dart';
import '../../models/chat_message.dart';
import '../../services/chat_service.dart';
import '../../utils/responsive.dart';

class ChatThreadScreen extends ConsumerStatefulWidget {
  final String id; // other user's id for direct, conversation id for thread
  final bool isThread;
  final String title;

  const ChatThreadScreen({super.key, required this.id, required this.isThread, required this.title});

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
  File? _pendingImage;
  bool _sendingImage = false;

  // Local, mutable view of what we're showing — starts as whatever the
  // widget was opened with, but a direct chat can "promote" into a group
  // thread mid-conversation (see _handleIncoming), so this can't just be
  // widget.id/widget.isThread.
  late String _id;
  late bool _isThread;

  @override
  void initState() {
    super.initState();
    _id = widget.id;
    _isThread = widget.isThread;
    _socket = ChatSocket(
      onMessage: _handleIncoming,
      onConnectionChanged: (c) {
        if (mounted) setState(() => _connected = c);
      },
    );
    _socket.connect();
    _loadHistory();
    _service.markRead(id: _id, isThread: _isThread);
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
      final history = await _service.getHistory(id: _id, isThread: _isThread);
      if (!mounted) return;
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
    if (_isThread) {
      if (msg.conversationId != _id) return;
    } else if (msg.conversationId != null && msg.senderId == myId) {
      // My own first message to a raw contact resolved server-side into a
      // group thread — follow the echo into that thread instead of
      // silently dropping it.
      setState(() {
        _isThread = true;
        _id = msg.conversationId!;
        _messages = [..._messages, msg];
      });
      _scrollToBottom();
      _service.markRead(id: _id, isThread: _isThread);
      return;
    } else {
      if (msg.conversationId != null) return; // some other direct chat's message resolved into a thread we're not viewing
      final otherId = msg.senderId == myId ? msg.receiverId : msg.senderId;
      if (otherId != _id) return;
    }
    setState(() => _messages = [..._messages, msg]);
    _scrollToBottom();
    _service.markRead(id: _id, isThread: _isThread);
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(_scrollCtrl.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      }
    });
  }

  Future<void> _pickImage() async {
    final picked = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85);
    if (picked == null) return;
    setState(() => _pendingImage = File(picked.path));
  }

  void _clearPendingImage() => setState(() => _pendingImage = null);

  void _openFullScreenImage(BuildContext context, String url) {
    Navigator.of(context).push(
      PageRouteBuilder(
        opaque: false,
        barrierColor: Colors.black,
        pageBuilder: (_, __, ___) => _FullScreenImageViewer(url: url),
      ),
    );
  }

  Future<void> _send() async {
    final text = _draftCtrl.text.trim();
    if (text.isEmpty && _pendingImage == null) return;

    String? imageKey;
    if (_pendingImage != null) {
      setState(() => _sendingImage = true);
      try {
        imageKey = await _service.uploadImage(_pendingImage!);
      } catch (_) {
        if (mounted) setState(() => _sendingImage = false);
        return;
      }
      if (mounted) setState(() => _sendingImage = false);
    }

    final ok = _socket.send(id: _id, isThread: _isThread, body: text, imageKey: imageKey);
    if (ok) {
      _draftCtrl.clear();
      _clearPendingImage();
    }
  }

  @override
  Widget build(BuildContext context) {
    final myId = ref.watch(authProvider).user?.id;

    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: Text(widget.title, style: const TextStyle(color: Color(0xFF1A1A1A), fontWeight: FontWeight.w600)),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(18),
          child: Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Text(_connected ? 'Connected' : 'Connecting...', style: TextStyle(fontSize: 11, color: _connected ? teal : Colors.grey)),
          ),
        ),
      ),
      body: ResponsiveCenter(child: Column(
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
                          // In a group thread, "not mine" can be 2+ different
                          // people (customer, employee, admin) — label who
                          // sent it so it's clear at a glance.
                          final showSenderLabel = _isThread && !mine && m.senderName != null;
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
                                  if (showSenderLabel)
                                    Padding(
                                      padding: const EdgeInsets.only(bottom: 3),
                                      child: Text(
                                        m.senderRole == 'admin'
                                            ? '${m.senderName} · Admin'
                                            : m.senderRole == 'employee'
                                                ? '${m.senderName} · Employee'
                                                : m.senderName!,
                                        style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: Colors.grey.shade500),
                                      ),
                                    ),
                                  if (m.imageUrl != null)
                                    Padding(
                                      padding: EdgeInsets.only(bottom: m.body.isNotEmpty ? 6 : 0),
                                      child: GestureDetector(
                                        onTap: () => _openFullScreenImage(context, m.imageUrl!),
                                        child: ClipRRect(
                                          borderRadius: BorderRadius.circular(10),
                                          child: CachedNetworkImage(
                                            imageUrl: m.imageUrl!,
                                            fit: BoxFit.cover,
                                            width: 200,
                                            height: 200,
                                            placeholder: (_, __) => Container(
                                              width: 200,
                                              height: 200,
                                              color: Colors.grey.shade100,
                                              child: const Center(child: CircularProgressIndicator(color: teal, strokeWidth: 2)),
                                            ),
                                            errorWidget: (_, __, ___) => Container(
                                              width: 200,
                                              height: 200,
                                              color: Colors.grey.shade100,
                                              child: const Icon(Icons.broken_image_outlined, color: Colors.grey),
                                            ),
                                          ),
                                        ),
                                      ),
                                    ),
                                  if (m.body.isNotEmpty)
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
              decoration: BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: Colors.grey.shade200))),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_pendingImage != null)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: Stack(
                          clipBehavior: Clip.none,
                          children: [
                            ClipRRect(
                              borderRadius: BorderRadius.circular(10),
                              child: Image.file(_pendingImage!, width: 64, height: 64, fit: BoxFit.cover),
                            ),
                            Positioned(
                              top: -6,
                              right: -6,
                              child: GestureDetector(
                                onTap: _clearPendingImage,
                                child: Container(
                                  width: 20,
                                  height: 20,
                                  decoration: const BoxDecoration(color: Color(0xFF1A1A1A), shape: BoxShape.circle),
                                  child: const Icon(Icons.close, color: Colors.white, size: 13),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    child: Row(
                      children: [
                        IconButton(
                          icon: Icon(Icons.image_outlined, color: _sendingImage ? Colors.grey.shade300 : teal),
                          onPressed: _sendingImage ? null : _pickImage,
                        ),
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
                        _sendingImage
                            ? const Padding(
                                padding: EdgeInsets.all(12),
                                child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: teal, strokeWidth: 2)),
                              )
                            : IconButton(
                                icon: const Icon(Icons.send, color: teal),
                                onPressed: _send,
                              ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      )),
    );
  }
}

// Pinch-to-zoom, tap-to-dismiss full-screen view of a chat image.
class _FullScreenImageViewer extends StatelessWidget {
  final String url;

  const _FullScreenImageViewer({required this.url});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => Navigator.of(context).pop(),
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Stack(
          children: [
            Center(
              child: InteractiveViewer(
                minScale: 1,
                maxScale: 4,
                child: CachedNetworkImage(
                  imageUrl: url,
                  fit: BoxFit.contain,
                  placeholder: (_, __) => const CircularProgressIndicator(color: Color(0xFF00A6A4)),
                  errorWidget: (_, __, ___) => const Icon(Icons.broken_image_outlined, color: Colors.white54, size: 48),
                ),
              ),
            ),
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: IconButton(
                  icon: const Icon(Icons.close, color: Colors.white),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
