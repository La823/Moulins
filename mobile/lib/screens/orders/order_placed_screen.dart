import 'dart:async';
import 'dart:math' as math;
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

/// The moment after an order goes through: a full green screen, a circle
/// that pops in with a tick drawing itself, the order sound and a light
/// vibration — then on to the order (after a couple of seconds, or on tap).
class OrderPlacedScreen extends StatefulWidget {
  /// Where to go afterwards: the order's page.
  final String next;

  /// The line under "Order placed!", e.g. "Your order has been sent to Moulins."
  final String message;

  const OrderPlacedScreen({super.key, required this.next, required this.message});

  @override
  State<OrderPlacedScreen> createState() => _OrderPlacedScreenState();
}

class _OrderPlacedScreenState extends State<OrderPlacedScreen> with SingleTickerProviderStateMixin {
  static const _green = Color(0xFF0C9D58);
  late final AnimationController _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400));
  late final Animation<double> _circle = CurvedAnimation(parent: _ctrl, curve: const Interval(0, 0.4, curve: Curves.elasticOut));
  late final Animation<double> _tick = CurvedAnimation(parent: _ctrl, curve: const Interval(0.3, 0.65, curve: Curves.easeOut));
  late final Animation<double> _text = CurvedAnimation(parent: _ctrl, curve: const Interval(0.55, 1, curve: Curves.easeOut));
  final _player = AudioPlayer();
  Timer? _leave;
  bool _left = false;

  @override
  void initState() {
    super.initState();
    _ctrl.forward();
    HapticFeedback.mediumImpact();
    _player.play(AssetSource('sounds/order.mp3')).catchError((_) {});
    _leave = Timer(const Duration(milliseconds: 2600), _continue);
  }

  void _continue() {
    if (_left || !mounted) return;
    _left = true;
    context.go(widget.next);
  }

  @override
  void dispose() {
    _leave?.cancel();
    _ctrl.dispose();
    _player.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(statusBarColor: _green),
      child: PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, _) => _continue(),
        child: GestureDetector(
          onTap: _continue,
          child: Scaffold(
            backgroundColor: _green,
            body: Center(
              child: AnimatedBuilder(
                animation: _ctrl,
                builder: (_, __) => Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Transform.scale(
                      scale: _circle.value,
                      child: Container(
                        width: 132,
                        height: 132,
                        decoration: BoxDecoration(
                          color: Colors.white,
                          shape: BoxShape.circle,
                          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.15), blurRadius: 24, offset: const Offset(0, 8))],
                        ),
                        child: CustomPaint(painter: _TickPainter(progress: _tick.value, color: _green)),
                      ),
                    ),
                    const SizedBox(height: 32),
                    Opacity(
                      opacity: _text.value,
                      child: Transform.translate(
                        offset: Offset(0, 16 * (1 - _text.value)),
                        child: Column(children: [
                          const Text('Order placed!',
                              style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w700)),
                          const SizedBox(height: 10),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 40),
                            child: Text(widget.message,
                                textAlign: TextAlign.center,
                                style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 15)),
                          ),
                          const SizedBox(height: 40),
                          Text('Tap to view your order',
                              style: TextStyle(color: Colors.white.withValues(alpha: 0.75), fontSize: 13)),
                        ]),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A tick that draws itself as [progress] goes from 0 to 1.
class _TickPainter extends CustomPainter {
  final double progress;
  final Color color;
  _TickPainter({required this.progress, required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    if (progress <= 0) return;
    final s = size.width;
    final path = Path()
      ..moveTo(s * 0.28, s * 0.52)
      ..lineTo(s * 0.44, s * 0.67)
      ..lineTo(s * 0.73, s * 0.37);
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = s * 0.085
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    for (final m in path.computeMetrics()) {
      canvas.drawPath(m.extractPath(0, m.length * math.min(progress, 1)), paint);
    }
  }

  @override
  bool shouldRepaint(_TickPainter old) => old.progress != progress;
}
