import 'package:flutter/foundation.dart';

/// Where tapping a notification goes in the app. The server's links
/// (deep_link) are the website's paths, e.g. /partner-panel/retailer-orders/<id>;
/// [appRouteFor] turns them into the app's own screens.
///
/// A tap (on a push, a banner shown while the app was open, or one that
/// launched the app) only records the screen in [pending]; the app's main
/// frame (main.dart, _AppShell) opens it once the app is up and logged in.
class NotificationLinks {
  static final pending = ValueNotifier<String?>(null);

  /// Records [link]'s screen for the app frame to open.
  static void open(String? link) {
    final route = appRouteFor(link);
    if (route != null) pending.value = route;
  }

  /// The app screen for a notification link, or null when it has none
  /// (staff pages with no app equivalent).
  static String? appRouteFor(String? link) {
    if (link == null || link.trim().isEmpty) return null;
    final uri = Uri.tryParse(link.trim());
    if (uri == null) return null;
    final seg = uri.pathSegments.where((s) => s.isNotEmpty).toList();
    if (seg.isEmpty) return null;
    String? id(int i) => seg.length > i ? seg[i] : null;

    switch (seg[0]) {
      // a retailer's order: the partner's page and the retailer's page are
      // the same screen in the app
      case 'partner-panel':
        if (id(1) == 'retailer-orders') return id(2) != null ? '/retailer-orders/${id(2)}' : '/retailer-orders';
        if (id(1) == 'retailers') return '/retailers';
        return '/dashboard';
      case 'retailer-panel':
        if (id(1) == 'orders' && id(2) != null) return '/retailer-orders/${id(2)}';
        return '/retailer-orders';
      // staff: a new order opens it on the staff order page; other panel
      // pages have no app screen
      case 'panel':
        if (id(1) == 'orders' && id(2) != null) return '/admin/orders/${id(2)}';
        if (id(1) == 'orders') return '/admin/orders';
        if (id(1) == 'partnership-requests') return '/admin';
        return null;
      case 'chat':
        return id(1) != null ? '/chat/${id(1)}' : '/chat';
      // the app has these screens at the same paths
      case 'retailer-orders':
      case 'orders':
      case 'meetings':
      case 'doctors':
      case 'dashboard':
      case 'payments':
      case 'requests':
      case 'products':
      case 'presentations':
      case 'notifications':
      case 'team':
      case 'retailers':
        return '/${seg.join('/')}';
    }
    return null;
  }
}
