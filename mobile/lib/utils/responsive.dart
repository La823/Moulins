import 'package:flutter/material.dart';

/// Breakpoints mirror the website's Tailwind `sm`/`lg` usage closely enough
/// for the same layouts (grid columns, side-by-side panels, centered
/// content) to kick in at roughly the same device sizes: phones stay
/// single-column, tablets in landscape (and large phones) get the wider
/// treatment.
const double kTabletBreakpoint = 700;
const double kDesktopBreakpoint = 1000;

bool isWide(BuildContext context) => MediaQuery.of(context).size.width >= kTabletBreakpoint;

bool isExtraWide(BuildContext context) => MediaQuery.of(context).size.width >= kDesktopBreakpoint;

/// Product/video/favorite grids go from the phone's 2 columns up to 3 or 4
/// as width increases, matching how the website's grid reflows.
int responsiveGridColumns(BuildContext context, {int base = 2, int wide = 3, int wider = 4}) {
  final width = MediaQuery.of(context).size.width;
  if (width >= kDesktopBreakpoint) return wider;
  if (width >= kTabletBreakpoint) return wide;
  return base;
}

/// Centers content with a max width on wide screens — the same
/// `max-w-*` + `mx-auto` centering pattern used throughout the website's
/// pages — while staying full-width (edge-to-edge) on phones.
class ResponsiveCenter extends StatelessWidget {
  final Widget child;
  final double maxWidth;

  const ResponsiveCenter({super.key, required this.child, this.maxWidth = 900});

  @override
  Widget build(BuildContext context) {
    if (!isWide(context)) return child;
    return Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth),
        child: child,
      ),
    );
  }
}
