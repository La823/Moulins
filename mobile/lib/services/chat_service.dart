import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../config/api.dart';
import '../models/chat_message.dart';

String _guessContentType(String filename) {
  final ext = filename.toLowerCase().split('.').last;
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'heic':
      return 'image/heic';
    default:
      return 'image/jpeg';
  }
}

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

  Future<List<ChatMessage>> getHistory({required String id, required bool isThread}) async {
    final path = isThread ? '/messages/thread/$id' : '/messages/$id';
    final res = await _dio.get(path);
    return (res.data as List<dynamic>).map((e) => ChatMessage.fromJson(e)).toList();
  }

  Future<void> markRead({required String id, required bool isThread}) async {
    final path = isThread ? '/messages/thread/$id/read' : '/messages/$id/read';
    try {
      await _dio.put(path);
    } catch (_) {
      // best-effort
    }
  }

  // Uploads a chat image directly to S3 via a presigned URL and returns the
  // S3 object key to send over the websocket — the image bytes never pass
  // through our own backend.
  Future<String> uploadImage(File file) async {
    final filename = file.path.split(Platform.pathSeparator).last;
    final res = await _dio.post('/messages/upload-url', data: {'filename': filename});
    final uploadUrl = res.data['upload_url'] as String;
    final key = res.data['key'] as String;

    final bytes = await file.readAsBytes();
    await Dio().put(
      uploadUrl,
      data: Stream.fromIterable([bytes]),
      options: Options(
        headers: {
          Headers.contentLengthHeader: bytes.length,
          Headers.contentTypeHeader: _guessContentType(filename),
        },
      ),
    );
    return key;
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

  // Send to a direct user (isThread: false) or into a group conversation
  // (isThread: true) — the server resolves/creates the right conversation
  // for direct sends that turn out to involve a partner. imageKey is the
  // S3 object key from ChatService.uploadImage, if this message has an
  // attached image.
  bool send({required String id, required bool isThread, required String body, String? imageKey}) {
    if (_channel == null) return false;
    final payload = {
      ...(isThread ? {'conversation_id': id} : {'to': id}),
      'body': body,
      if (imageKey != null) 'image_key': imageKey,
    };
    _channel!.sink.add(jsonEncode(payload));
    return true;
  }

  void dispose() {
    _closed = true;
    _retryTimer?.cancel();
    _sub?.cancel();
    _channel?.sink.close();
  }
}
