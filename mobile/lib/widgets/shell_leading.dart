import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../config/app_flavor.dart';
import '../providers/auth_provider.dart';

/// The app bar's left side on the pages with the side menu: a back arrow
/// and the menu button. Back goes to the page before, or to the first tab
/// (Home; Packing for the dispatch team) when there is none, the same as
/// the back gesture (main.dart). On the first tab itself, only the menu.
///
///   AppBar(leadingWidth: ShellLeading.widthFor(context), leading: const ShellLeading(), ...)
class ShellLeading extends StatelessWidget {
  const ShellLeading({super.key});

  static String _home(BuildContext context) {
    final u = ProviderScope.containerOf(context, listen: false).read(authProvider).user;
    return isTeamApp && (u?.isDispatch ?? false) ? '/packing' : '/home';
  }

  static bool _showBack(BuildContext context) {
    if (Navigator.of(context).canPop()) return true;
    final path = GoRouter.of(context).routerDelegate.currentConfiguration.uri.path;
    return path != _home(context);
  }

  static double widthFor(BuildContext context) => _showBack(context) ? 96 : 56;

  @override
  Widget build(BuildContext context) {
    final back = _showBack(context);
    return Row(mainAxisSize: MainAxisSize.min, children: [
      if (back)
        IconButton(
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Back',
          onPressed: () {
            final nav = Navigator.of(context);
            if (nav.canPop()) {
              nav.maybePop();
              return;
            }
            final router = GoRouter.of(context);
            if (router.canPop()) {
              router.pop();
            } else {
              router.go(_home(context));
            }
          },
        ),
      IconButton(
        icon: const Icon(Icons.menu),
        tooltip: 'Menu',
        onPressed: () => Scaffold.of(context).openDrawer(),
      ),
    ]);
  }
}

/// The back arrow for every other page: back to the page before, or to the
/// first tab when the page was opened with nothing under it (from the menu,
/// a notification or the bottom bar).
///
///   AppBar(leading: const ShellBack(), ...)
class ShellBack extends StatelessWidget {
  const ShellBack({super.key});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: const Icon(Icons.arrow_back),
      tooltip: 'Back',
      onPressed: () {
        final nav = Navigator.of(context);
        if (nav.canPop()) {
          nav.maybePop();
          return;
        }
        final router = GoRouter.of(context);
        if (router.canPop()) {
          router.pop();
        } else {
          router.go(ShellLeading._home(context));
        }
      },
    );
  }
}
