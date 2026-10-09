import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../models/presentation.dart';

// "Notebook" way of presenting a deck — the same viewer as the website's
// (frontend/src/components/presentations): the slides laid out as the pages
// of an open book that you drag to turn. The first left-hand page carries
// only the Moulins logo, so slide 1 opens on the right like the first page
// of a real book.
//
// The turning leaf is a chain of narrow strips, each tilted a little more
// than the last, so the page bends the way paper bends instead of pivoting
// like a door. Each strip is a window onto the spread it belongs to.
//
// Forces landscape while open (a spread is twice as wide as it is tall) and
// hands orientation back to the system on the way out.

const _strips = 18; // enough for a smooth curve
const _beta = 0.6; // peak curl of the leaf, radians
const _pageAspect = 1.1; // one page, width / height
const _desk = Color(0xFFECE7DC);
const _paper = Color(0xFFFBF8F0);
const _inkSoft = Color(0x942B2721);
const _inkFaint = Color(0x5C2B2721);
const _shadeRgb = Color(0xFF3A2B14);

enum _Dir { next, prev }

class _Turn {
  final _Dir dir;
  final int from;
  final int to;
  _Turn(this.dir, this.from, this.to);
}

class _Page {
  final bool isTitle;
  final String? imageUrl;
  final String? label;
  const _Page.title()
      : isTitle = true,
        imageUrl = null,
        label = null;
  const _Page.slide(this.imageUrl, this.label) : isTitle = false;
}

class NotebookPresentationScreen extends StatefulWidget {
  final List<PresentationSlide> slides;

  /// How a slide's image is loaded; tests swap in local images.
  final ImageProvider Function(String url) imageFor;

  const NotebookPresentationScreen({
    super.key,
    required this.slides,
    this.imageFor = _networkImage,
  });

  static ImageProvider _networkImage(String url) => CachedNetworkImageProvider(url);

  @override
  State<NotebookPresentationScreen> createState() => _NotebookPresentationScreenState();
}

class _NotebookPresentationScreenState extends State<NotebookPresentationScreen>
    with SingleTickerProviderStateMixin {
  late final List<_Page> _pages = [
    const _Page.title(),
    ...widget.slides.map((s) => _Page.slide(s.imageUrl, s.productName)),
  ];
  late final int _spreadCount = (_pages.length + 1) ~/ 2;
  late final AnimationController _ctrl = AnimationController.unbounded(vsync: this);

  int _idx = 0;
  _Turn? _turn;
  bool _committing = false;

  // page drag
  bool _dragging = false;
  double _dragX0 = 0;

  // pinch zoom
  double _zoom = 1;
  Offset _pan = Offset.zero;
  double _zoomAtStart = 1;
  Offset _focalAtStart = Offset.zero;
  Offset _panAtStart = Offset.zero;

  // Widgets built once per turn and reused every frame, so the animation
  // only moves strips around instead of rebuilding images.
  Size? _builtFor;
  List<Widget> _spreadWidgets = [];
  List<Widget> _fromSlices = [];
  List<Widget> _toSlices = [];

  @override
  void initState() {
    super.initState();
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersive);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    for (final p in _pages) {
      if (p.imageUrl != null) precacheImage(widget.imageFor(p.imageUrl!), context).catchError((_) {});
    }
  }

  @override
  void dispose() {
    SystemChrome.setPreferredOrientations([]);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    _ctrl.dispose();
    super.dispose();
  }

  // ------------------------------------------------------------ turning
  /// Starts turning a page; false when there is no page that way — a
  /// presentation has a first and last page and never wraps round.
  bool _startTurn(_Dir dir) {
    _settle();
    final to = dir == _Dir.next ? _idx + 1 : _idx - 1;
    if (to < 0 || to >= _spreadCount) return false;
    setState(() {
      _turn = _Turn(dir, _idx, to);
      _builtFor = null; // rebuild the slices for this pair of spreads
      _ctrl.value = 0;
    });
    return true;
  }

  /// Lands anything still in flight where it was headed.
  void _settle() {
    final turn = _turn;
    if (turn == null) return;
    _ctrl.stop();
    _idx = _committing ? turn.to : turn.from;
    _turn = null;
    _committing = false;
  }

  void _commit([double velocity = 0]) => _runTo(1, velocity);
  void _cancel([double velocity = 0]) => _runTo(0, velocity);

  void _runTo(double target, double velocity) {
    if (_turn == null) return;
    _committing = target == 1;
    void done() {
      if (!mounted || _turn == null) return;
      setState(_settle);
    }

    if (MediaQuery.of(context).disableAnimations) {
      _ctrl.value = target;
      done();
      return;
    }
    final spring = SpringDescription(mass: 1, stiffness: target == 1 ? 170 : 150, damping: target == 1 ? 26 : 24);
    _ctrl.animateWith(SpringSimulation(spring, _ctrl.value, target, velocity, tolerance: const Tolerance(distance: 0.002, velocity: 0.02))).whenComplete(done);
  }

  void _step(_Dir dir) {
    if (_startTurn(dir)) _commit();
  }

  // ------------------------------------------------------------ gestures
  bool get _zoomed => _zoom > 1.01;

  void _onTapUp(TapUpDetails d, double width) {
    if (_zoomed) return;
    _step(d.localPosition.dx > width / 2 ? _Dir.next : _Dir.prev);
  }

  void _onScaleStart(ScaleStartDetails d, double width) {
    _zoomAtStart = _zoom;
    _focalAtStart = d.focalPoint;
    _panAtStart = _pan;
    _dragging = false;
    if (d.pointerCount == 1 && !_zoomed) {
      final dir = d.localFocalPoint.dx > width / 2 ? _Dir.next : _Dir.prev;
      if (_startTurn(dir)) {
        _dragging = true;
        _dragX0 = d.focalPoint.dx;
      }
    }
  }

  void _onScaleUpdate(ScaleUpdateDetails d, Size book) {
    final turn = _turn;
    if (_dragging && d.pointerCount > 1) {
      // a second finger landed: this is a pinch, not a page turn
      _dragging = false;
      _cancel();
    }
    if (_dragging && turn != null) {
      final dx = d.focalPoint.dx - _dragX0;
      final raw = (turn.dir == _Dir.next ? -dx : dx) / (book.width * 0.62);
      _ctrl.value = raw.clamp(0.0, 1.0);
      return;
    }
    if (d.pointerCount < 2 && !_zoomed) return;
    setState(() {
      _zoom = (_zoomAtStart * d.scale).clamp(1.0, 3.0);
      final maxX = (_zoom - 1) * book.width / 2, maxY = (_zoom - 1) * book.height / 2;
      final p = _panAtStart + (d.focalPoint - _focalAtStart);
      _pan = Offset(p.dx.clamp(-maxX, maxX), p.dy.clamp(-maxY, maxY));
      if (!_zoomed) _pan = Offset.zero;
    });
  }

  void _onScaleEnd(ScaleEndDetails d, double width) {
    final turn = _turn;
    if (!_dragging || turn == null) return;
    _dragging = false;
    // progress per second, from the finger's speed
    final pxPerSec = d.velocity.pixelsPerSecond.dx * (turn.dir == _Dir.next ? -1 : 1);
    final vel = pxPerSec / (width * 0.62);
    if (_ctrl.value > 0.42 || vel > 1.1) {
      _commit(vel.clamp(0.0, 8.0));
    } else {
      _cancel(vel.clamp(-8.0, 0.0));
    }
  }

  // ------------------------------------------------------------ captions
  _Page? _pageAt(int i) => i < _pages.length ? _pages[i] : null;

  String _spreadTitle(int s) {
    final names = <String>[];
    for (final p in [_pageAt(2 * s), _pageAt(2 * s + 1)]) {
      final l = p?.label;
      if (l != null && l.isNotEmpty && !names.contains(l)) names.add(l);
    }
    return names.join('  ·  ');
  }

  String _spreadCountLabel(int s) {
    final total = widget.slides.length;
    final nums = [
      if (_pageAt(2 * s)?.imageUrl != null) 2 * s,
      if (_pageAt(2 * s + 1)?.imageUrl != null) 2 * s + 1,
    ];
    if (nums.isEmpty) return '$total ${total == 1 ? 'slide' : 'slides'}';
    return '${nums.length > 1 ? '${nums[0]}–${nums[1]}' : nums[0]} / $total';
  }

  // ------------------------------------------------------------ build
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _desk,
      body: Container(
        decoration: const BoxDecoration(
          gradient: RadialGradient(
            center: Alignment(0, -0.6),
            radius: 1.2,
            colors: [Color(0xD9FFFCF4), Color(0x00FFFCF4)],
          ),
        ),
        child: SafeArea(
          child: Stack(
            children: [
              Column(
                children: [
                  Expanded(
                    child: Row(
                      children: [
                        _arrow(Icons.chevron_left, _Dir.prev),
                        Expanded(child: LayoutBuilder(builder: (_, c) => _bookArea(c))),
                        _arrow(Icons.chevron_right, _Dir.next),
                      ],
                    ),
                  ),
                  AnimatedBuilder(animation: _ctrl, builder: (_, __) => _captions()),
                  const SizedBox(height: 8),
                ],
              ),
              Positioned(
                top: 4,
                right: 4,
                child: IconButton(
                  icon: const Icon(Icons.close, color: _inkSoft),
                  tooltip: 'Close',
                  onPressed: () => Navigator.of(context).maybePop(),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _arrow(IconData icon, _Dir dir) {
    final dest = _turn?.to ?? _idx;
    final enabled = dir == _Dir.next ? dest < _spreadCount - 1 : dest > 0;
    return SizedBox(
      width: 44,
      child: IconButton(
        icon: Icon(icon, size: 32),
        color: _inkSoft,
        disabledColor: _inkFaint.withValues(alpha: 0.12),
        onPressed: enabled ? () => _step(dir) : null,
      ),
    );
  }

  Widget _captions() {
    final turn = _turn;
    final t = _ctrl.value.clamp(0.0, 1.0);
    final shown = turn == null ? _idx : (t < 0.5 ? turn.from : turn.to);
    final fade = turn == null ? 1.0 : (t < 0.5 ? 1 - (t / 0.38).clamp(0.0, 1.0) : ((t - 0.56) / 0.3).clamp(0.0, 1.0));
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Opacity(
          opacity: fade,
          child: Text(
            _spreadTitle(shown).toUpperCase(),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontFamily: 'serif', fontSize: 12, letterSpacing: 2.6, color: _inkSoft),
          ),
        ),
        const SizedBox(height: 2),
        Text(
          _spreadCountLabel(turn?.to ?? _idx),
          style: const TextStyle(fontFamily: 'serif', fontSize: 11, fontStyle: FontStyle.italic, color: _inkFaint),
        ),
      ],
    );
  }

  Widget _bookArea(BoxConstraints c) {
    // two pages side by side, as large as the space allows
    final availH = c.maxHeight - 12;
    final w = math.min(c.maxWidth, availH * 2 * _pageAspect);
    final book = Size(w, w / (2 * _pageAspect));
    _prepare(book);

    return Center(
      child: GestureDetector(
        key: const ValueKey('notebook-book'),
        behavior: HitTestBehavior.opaque,
        onTapUp: (d) => _onTapUp(d, book.width),
        onScaleStart: (d) => _onScaleStart(d, book.width),
        onScaleUpdate: (d) => _onScaleUpdate(d, book),
        onScaleEnd: (d) => _onScaleEnd(d, book.width),
        child: Transform(
          alignment: Alignment.center,
          transform: Matrix4.translationValues(_pan.dx, _pan.dy, 0).multiplied(Matrix4.diagonal3Values(_zoom, _zoom, 1)),
          child: SizedBox.fromSize(
            size: book,
            child: DecoratedBox(
              decoration: const BoxDecoration(
                boxShadow: [
                  BoxShadow(color: Color(0x40382C1A), blurRadius: 26, offset: Offset(0, 14)),
                  BoxShadow(color: Color(0x2A2C200E), blurRadius: 6, offset: Offset(0, 3)),
                ],
              ),
              child: AnimatedBuilder(animation: _ctrl, builder: (_, __) => _book(book)),
            ),
          ),
        ),
      ),
    );
  }

  /// (Re)builds the spread widgets and the strip slices when the turn or
  /// the book's size changes — never per animation frame.
  void _prepare(Size book) {
    if (_builtFor == book && (_turn == null || _fromSlices.isNotEmpty)) return;
    _builtFor = book;
    _spreadWidgets = List.generate(_spreadCount, (s) => _spread(s, book));
    _fromSlices = [];
    _toSlices = [];
    final turn = _turn;
    if (turn == null) return;
    final sw = book.width / 2 / _strips;
    final g = book.width / 2;
    for (var i = 0; i < _strips; i++) {
      final nearRight = g + i * sw; // slice just right of the gutter
      final nearLeft = g - (i + 1) * sw; // slice just left of it
      if (turn.dir == _Dir.next) {
        _fromSlices.add(_slice(turn.from, nearRight, sw, book, mirrored: false));
        _toSlices.add(_slice(turn.to, nearLeft, sw, book, mirrored: true));
      } else {
        _fromSlices.add(_slice(turn.from, nearLeft, sw, book, mirrored: true));
        _toSlices.add(_slice(turn.to, nearRight, sw, book, mirrored: false));
      }
    }
  }

  /// A strip-wide window onto spread [s], starting at [x0] in book pixels.
  /// Mirrored when the strip's own x axis runs right-to-left on screen.
  Widget _slice(int s, double x0, double sw, Size book, {required bool mirrored}) {
    Widget w = SizedBox(
      width: sw + 0.8, // a hair of overlap, so no seams show between strips
      height: book.height,
      child: ClipRect(
        child: OverflowBox(
          alignment: Alignment.topLeft,
          minWidth: book.width,
          maxWidth: book.width,
          minHeight: book.height,
          maxHeight: book.height,
          child: Transform.translate(offset: Offset(-x0, 0), child: _spreadWidgets[s]),
        ),
      ),
    );
    if (mirrored) {
      w = Transform(alignment: Alignment.center, transform: Matrix4.diagonal3Values(-1, 1, 1), child: w);
    }
    return w;
  }

  Widget _half(int s, Size book, {required bool left}) {
    return Positioned(
      left: left ? 0 : book.width / 2,
      top: 0,
      width: book.width / 2,
      height: book.height,
      child: ClipRect(
        child: OverflowBox(
          alignment: left ? Alignment.topLeft : Alignment.topRight,
          minWidth: book.width,
          maxWidth: book.width,
          minHeight: book.height,
          maxHeight: book.height,
          child: _spreadWidgets[s],
        ),
      ),
    );
  }

  Widget _book(Size book) {
    final turn = _turn;
    if (turn == null) return _spreadWidgets[_idx];

    final t = _ctrl.value.clamp(0.0, 1.0);
    final shade = math.sin(math.pi * t);
    final next = turn.dir == _Dir.next;
    final g = book.width / 2;
    final sw = g / _strips;

    final children = <Widget>[
      _half(next ? turn.from : turn.to, book, left: true),
      _half(next ? turn.to : turn.from, book, left: false),
      // the shadow the lifting leaf throws onto the page beneath it
      Positioned(
        left: next ? g : g * 0.08,
        width: g * 0.92,
        top: 0,
        bottom: 0,
        child: IgnorePointer(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: next ? Alignment.centerLeft : Alignment.centerRight,
                end: next ? Alignment.centerRight : Alignment.centerLeft,
                colors: [_shadeRgb.withValues(alpha: 0.27 * shade * 0.62), _shadeRgb.withValues(alpha: 0)],
                stops: const [0, 0.82],
              ),
            ),
          ),
        ),
      ),
    ];

    // the leaf: each strip tilted a little less than the one before it
    final th = math.pi * t;
    final beta = _beta * shade;
    final tt = th + beta, td = 2 * beta / _strips;
    final cx = book.width / 2, cy = book.height / 2;
    // gentler than the website's: here the book fills the screen, with no
    // desk around it for a lifted page to grow into
    final persp = Matrix4.identity()..setEntry(3, 2, 1 / (book.width * 2.4));
    final view = Matrix4.translationValues(cx, cy, 0).multiplied(persp).multiplied(Matrix4.translationValues(-cx, -cy, 0));
    var px = 0.0, pz = 0.0; // the strip's near edge, from the gutter; -z is toward the viewer
    for (var i = 0; i < _strips; i++) {
      final a = tt - i * td; // how far this strip has swung over
      final theta = next ? a : math.pi - a;
      final m = view
          .multiplied(Matrix4.translationValues(g + px, 0, pz))
          .multiplied(Matrix4.rotationY(theta));
      final l1 = math.cos(a).abs(), l2 = math.cos(a - td).abs();
      final fromSide = math.cos(a) >= 0;
      children.add(Positioned(
        left: 0,
        top: 0,
        child: IgnorePointer(
          child: Transform(
            transform: m,
            child: Stack(
              children: [
                fromSide ? _fromSlices[i] : _toSlices[i],
                // light falls off as the strip turns away from it; exactly a
                // strip wide, so the overlap between strips isn't shaded twice
                Positioned(
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: sw,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          _shadeRgb.withValues(alpha: (1 - l1) * 0.62),
                          _shadeRgb.withValues(alpha: (1 - l2) * 0.62),
                        ],
                      ),
                    ),
                  ),
                ),
                Positioned(
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: sw,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          const Color(0xFFFFFAF0).withValues(alpha: shade * l1 * l1 * 0.2),
                          const Color(0xFFFFFAF0).withValues(alpha: shade * l2 * l2 * 0.2),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ));
      final dir = next ? 1.0 : -1.0;
      px += dir * sw * math.cos(a);
      pz -= sw * math.sin(a);
    }
    return Stack(clipBehavior: Clip.none, children: children);
  }

  // ------------------------------------------------------------ a spread
  Widget _spread(int s, Size book) {
    final w = book.width;
    return SizedBox.fromSize(
      size: book,
      child: Stack(
        children: [
          Positioned(left: 0, top: 0, bottom: 0, width: w / 2, child: _page(_pageAt(2 * s), 2 * s, w, left: true)),
          Positioned(left: w / 2, top: 0, bottom: 0, width: w / 2, child: _page(_pageAt(2 * s + 1), 2 * s + 1, w, left: false)),
          // the fold itself
          Positioned(left: w / 2 - 0.5, top: 0, bottom: 0, width: 1, child: const ColoredBox(color: Color(0x2E5A4628))),
        ],
      ),
    );
  }

  Widget _page(_Page? p, int num, double bw, {required bool left}) {
    final paper = BoxDecoration(
      gradient: LinearGradient(
        begin: left ? Alignment.centerLeft : Alignment.centerRight,
        end: left ? Alignment.centerRight : Alignment.centerLeft,
        colors: const [Color(0xFFF4EFE3), _paper, _paper, Color(0xFFEFE8D8), Color(0xFFE2D8C3)],
        stops: const [0, 0.07, 0.78, 0.94, 1],
      ),
    );
    if (p == null) return DecoratedBox(decoration: paper);
    if (p.isTitle) {
      return DecoratedBox(
        decoration: paper,
        child: Center(
          child: FractionallySizedBox(
            widthFactor: 0.56,
            child: Image.asset('assets/images/moulins_logo.png', fit: BoxFit.contain),
          ),
        ),
      );
    }
    return DecoratedBox(
      decoration: paper,
      child: Stack(
        children: [
          if (p.label != null)
            Positioned(
              top: bw * 0.010,
              left: bw * 0.03,
              right: bw * 0.03,
              child: Text(
                p.label!.toUpperCase(),
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontFamily: 'serif', fontSize: bw * 0.0115, letterSpacing: bw * 0.0023, color: _inkSoft),
              ),
            ),
          Positioned.fill(
            top: bw * 0.034,
            bottom: bw * 0.036,
            left: bw * 0.018,
            right: bw * 0.018,
            child: Image(
              image: widget.imageFor(p.imageUrl!),
              fit: BoxFit.contain,
              gaplessPlayback: true,
              errorBuilder: (_, __, ___) => const Center(child: Icon(Icons.broken_image_outlined, color: _inkFaint)),
            ),
          ),
          Positioned(
            bottom: bw * 0.008,
            left: 0,
            right: 0,
            child: Text(
              '$num',
              textAlign: TextAlign.center,
              style: TextStyle(fontFamily: 'serif', fontSize: bw * 0.013, fontStyle: FontStyle.italic, color: _inkFaint),
            ),
          ),
        ],
      ),
    );
  }
}
