import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Rounds a typed quantity up to the nearest multiple of the product's MOQ
/// (typing 7 with an MOQ of 5 gives 10), and never below one MOQ.
int roundUpToMoq(int quantity, int moq) {
  final step = moq > 0 ? moq : 1;
  final rounded = ((quantity + step - 1) ~/ step) * step;
  return rounded < step ? step : rounded;
}

/// The cart's quantity box, between the − and + buttons (cart screen and
/// side cart): tap it and type a number; the whole number is selected on
/// tap so typing replaces it. On Done or tapping away it is rounded up to
/// the MOQ and saved; an empty or 0 entry puts the old quantity back
/// (the ✕ removes a product).
class CartQtyField extends StatefulWidget {
  final int quantity;
  final int moq;
  final ValueChanged<int> onCommit;
  final double width;
  final double fontSize;

  const CartQtyField({
    super.key,
    required this.quantity,
    required this.moq,
    required this.onCommit,
    this.width = 52,
    this.fontSize = 16,
  });

  @override
  State<CartQtyField> createState() => _CartQtyFieldState();
}

class _CartQtyFieldState extends State<CartQtyField> {
  late final TextEditingController _ctrl = TextEditingController(text: '${widget.quantity}');
  final FocusNode _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _focus.addListener(() {
      if (_focus.hasFocus) {
        // select all, so typing replaces the number
        _ctrl.selection = TextSelection(baseOffset: 0, extentOffset: _ctrl.text.length);
      } else {
        _commit();
      }
    });
  }

  @override
  void didUpdateWidget(covariant CartQtyField oldWidget) {
    super.didUpdateWidget(oldWidget);
    // the − / + buttons changed it
    if (oldWidget.quantity != widget.quantity && !_focus.hasFocus) _ctrl.text = '${widget.quantity}';
  }

  void _commit() {
    final parsed = int.tryParse(_ctrl.text);
    if (parsed == null || parsed < 1) {
      _ctrl.text = '${widget.quantity}';
      return;
    }
    final rounded = roundUpToMoq(parsed, widget.moq);
    _ctrl.text = '$rounded';
    if (rounded != widget.quantity) widget.onCommit(rounded);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const teal = Color(0xFF00A6A4);
    return SizedBox(
      width: widget.width,
      child: TextField(
        controller: _ctrl,
        focusNode: _focus,
        keyboardType: TextInputType.number,
        textInputAction: TextInputAction.done,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(5)],
        textAlign: TextAlign.center,
        style: TextStyle(fontWeight: FontWeight.w700, fontSize: widget.fontSize, color: const Color(0xFF1A1A1A)),
        decoration: InputDecoration(
          isDense: true,
          contentPadding: const EdgeInsets.symmetric(vertical: 7, horizontal: 2),
          filled: true,
          fillColor: Colors.white,
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: BorderSide(color: Colors.grey.shade300),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: teal, width: 1.5),
          ),
        ),
        onSubmitted: (_) => _focus.unfocus(),
        onTapOutside: (_) => _focus.unfocus(),
      ),
    );
  }
}
