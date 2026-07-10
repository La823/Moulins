import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../config/api.dart';
import '../models/chat_message.dart';

class ChatService {
  final _dio = createDio();

  Future<List<ChatConversation>> getConversations() async {
    final res = await _dio.get('/messages/conversations');
    return (res.data as List<dynamic>).map((e) => ChatConversation.fromJson(e)).toList();
  }

  Future<List<ChatContact>> getContacts() async {
    final res = await _dio.get('/chat-contacts');
    return (res.data as List<dynamic>).map((e) => ChatContact.fromJson(e)).toList();
  }

  Future<List<ChatMessage>> getHistory(String otherUserId) async {
    final res = await _dio.get('/messages/$otherUserId');
    return (res.data as List<dynamic>).map((e) => ChatMessage.fromJson(e)).toList();
  }
}

// Maintains one live WebSocket connection for the app's lifetime, auto
// reconnecting on drop. Mirrors the web client's lib/chatSocket.js.
class ChatSocket {
  WebSocketChannel? _channel;
  StreamSubscription? _sub;
  Timer? _retryTimer;
  bool _closed = false;

  final void Function(ChatMessage message) onMessage;
  final void Function(bool connected)? onConnectionChanged;

  ChatSocket({required this.onMessage, this.onConnectionChanged});

  Future<void> connect() async {
    final token = await getToken();
    if (token == null || _closed) return;

    final wsUrl = baseUrl.replaceFirst('http', 'ws');
    try {
      _channel = WebSocketChannel.connect(Uri.parse('$wsUrl/ws?token=$token'));
      onConnectionChanged?.call(true);
      _sub = _channel!.stream.listen(
        (event) {
          try {
            final data = jsonDecode(event as String);
            if (data['type'] == 'message') {
              onMessage(ChatMessage.fromJson(data['message']));
            }
          } catch (_) {
            // ignore malformed frames
          }
        },
        onDone: _scheduleReconnect,
        onError: (_) => _scheduleReconnect(),
      );
    } catch (_) {
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    onConnectionChanged?.call(false);
    if (_closed) return;
    _retryTimer?.cancel();
    _retryTimer = Timer(const Duration(seconds: 3), connect);
  }

  bool send(String toUserId, String body) {
    if (_channel == null) return false;
    _channel!.sink.add(jsonEncode({'to': toUserId, 'body': body}));
    return true;
  }

  void dispose() {
    _closed = true;
    _retryTimer?.cancel();
    _sub?.cancel();
    _channel?.sink.close();
  }
}
