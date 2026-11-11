import 'dart:ui';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'providers/auth_provider.dart';
import 'providers/cart_provider.dart';
import 'providers/notification_provider.dart';
import 'services/local_notifications_service.dart';
import 'services/presentation_downloads.dart';
import 'services/notification_links.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'screens/login/login_screen.dart';
import 'screens/products/products_screen.dart';
import 'screens/products/product_detail_screen.dart';
import 'screens/products/special_products_screen.dart';
import 'screens/products/special_product_detail_screen.dart';
import 'screens/orders/orders_screen.dart';
import 'screens/orders/order_detail_screen.dart';
import 'screens/doctors/doctors_screen.dart';
import 'screens/doctors/doctor_detail_resolver.dart';
import 'screens/presentations/presentations_screen.dart';
import 'screens/presentations/presentation_builder_screen.dart';
import 'screens/presentations/notebook_presentation_screen.dart';
import 'screens/cart/cart_screen.dart';
import 'screens/home/home_screen.dart';
import 'screens/home/profile_screen.dart';
import 'screens/onboarding/onboarding_screen.dart';
import 'screens/notifications/notifications_screen.dart';
import 'screens/meetings/meetings_screen.dart';
import 'screens/requests/requests_screen.dart';
import 'screens/chat/chat_list_screen.dart';
import 'screens/chat/chat_thread_resolver.dart';
import 'screens/products/favorites_screen.dart';
import 'screens/learning/learning_screen.dart';
import 'screens/admin/admin_dashboard_screen.dart';
import 'screens/admin/admin_orders_screen.dart';
import 'screens/admin/admin_order_detail_screen.dart';
import 'screens/divisions/division_landing_screen.dart';
import 'screens/team/team_screen.dart';
import 'screens/team/team_member_detail_screen.dart';
import 'screens/team/team_attendance_screen.dart';
import 'screens/team/team_logs_screen.dart';
import 'screens/team/my_attendance_screen.dart';
import 'screens/team/my_daily_log_screen.dart';
import 'screens/payments/payments_screen.dart';
import 'screens/retailers/retailers_screen.dart';
import 'screens/orders/order_placed_screen.dart';
import 'screens/retailers/retailer_orders_screen.dart';
import 'screens/retailers/retailer_order_detail_screen.dart';
import 'screens/dashboard/dashboard_screen.dart';
import 'models/team_member.dart';
import 'data/divisions.dart';
import 'models/presentation.dart';
import 'widgets/fullscreen_image_gallery.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Room for a whole presentation's slides decoded at once (default 100 MB),
  // so turning back and forth doesn't decode them again.
  PaintingBinding.instance.imageCache.maximumSizeBytes = 250 << 20;

  try {
    await Firebase.initializeApp();
    await LocalNotificationsService.init();
    // iOS shows nothing for a push while the app is open unless asked to;
    // this lets it show with its sound (the order sound for new orders).
    await FirebaseMessaging.instance.setForegroundNotificationPresentationOptions(alert: true, badge: true, sound: true);
    FirebaseMessaging.onMessage.listen((message) {
      final notification = message.notification;
      if (notification != null) {
        LocalNotificationsService.show(
          title: notification.title ?? 'Moulins',
          body: notification.body ?? '',
          imageUrl: notification.android?.imageUrl ?? notification.apple?.imageUrl,
          notificationId: message.data['notification_id'],
          channelId: message.data['channel'] ?? notification.android?.channelId,
          deepLink: message.data['deep_link'],
        );
      }
    });
    // Tapping a push opens its page: while the app was in the background,
    // or when the tap launched it.
    FirebaseMessaging.onMessageOpenedApp.listen((m) => NotificationLinks.open(m.data['deep_link']));
    FirebaseMessaging.instance.getInitialMessage().then((m) {
      if (m != null) NotificationLinks.open(m.data['deep_link']);
    }).catchError((_) {});
  } catch (e) {
    debugPrint('Firebase init failed: $e');
  }

  FlutterError.onError = (details) {
    debugPrint('=== FLUTTER ERROR ===');
    debugPrint(details.exceptionAsString());
    debugPrint(details.stack.toString());
  };

  PlatformDispatcher.instance.onError = (error, stack) {
    debugPrint('=== DART ERROR ===');
    debugPrint(error.toString());
    debugPrint(stack.toString());
    return true;
  };

  runApp(const ProviderScope(child: MoulinsApp()));
}

class MoulinsApp extends ConsumerWidget {
  const MoulinsApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = GoRouter(
      initialLocation: '/login',
      routes: [
        GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
        GoRoute(path: '/cart', builder: (_, __) => const CartScreen()),
        GoRoute(path: '/onboarding', builder: (_, __) => const OnboardingScreen()),
        // Top-level (not nested in the ShellRoute) so it covers the full
        // screen including the persistent bottom nav bar, and so go_router
        // itself owns back/predictive-back handling for it — see the
        // comment in fullscreen_image_gallery.dart for why that matters.
        GoRoute(
          path: '/gallery',
          builder: (_, state) {
            final extra = state.extra as Map<String, dynamic>;
            return FullScreenImageGalleryScreen(
              imageUrls: List<String>.from(extra['imageUrls'] as List),
              initialIndex: extra['initialIndex'] as int? ?? 0,
              cacheManager: extra['cacheManager'] as BaseCacheManager?,
            );
          },
        ),
        // The green "Order placed!" moment after checkout, full screen (no
        // bottom bar); goes on to the order by itself.
        GoRoute(
          path: '/order-placed',
          builder: (_, state) {
            final extra = state.extra as Map<String, dynamic>? ?? const {};
            return OrderPlacedScreen(
              next: extra['next'] as String? ?? '/orders',
              message: extra['message'] as String? ?? 'Your order has been placed.',
            );
          },
        ),
        // Top-level for the same reasons as /gallery above.
        GoRoute(
          path: '/notebook',
          // Presentation images come through the presentations cache, so a
          // downloaded deck plays offline (services/presentation_downloads.dart).
          builder: (_, state) => NotebookPresentationScreen(
            slides: List<PresentationSlide>.from(state.extra as List),
            imageFor: (url) => FullScreenImageGalleryScreen.screenSized(url, cacheManager: PresentationDownloads.cache),
          ),
        ),
        ShellRoute(
          builder: (_, state, child) =>
              _AppShell(child: child, location: state.uri.path),
          routes: [
            GoRoute(path: '/home', builder: (_, __) => const HomeScreen()),
            GoRoute(path: '/dashboard', builder: (_, __) => const DashboardScreen()),
            GoRoute(
              path: '/products',
              builder: (_, state) => ProductsScreen(
                initialCategory: state.uri.queryParameters['category'],
                initialTag: state.uri.queryParameters['tag'],
              ),
              routes: [
                GoRoute(
                  path: ':id',
                  builder: (_, state) =>
                      ProductDetailScreen(productId: state.pathParameters['id']!),
                ),
              ],
            ),
            GoRoute(
              path: '/special',
              builder: (_, __) => const SpecialProductsScreen(),
              routes: [
                GoRoute(
                  path: ':id',
                  builder: (_, state) =>
                      SpecialProductDetailScreen(productId: state.pathParameters['id']!),
                ),
              ],
            ),
            GoRoute(
              path: '/orders',
              builder: (_, __) => const OrdersScreen(),
              routes: [
                GoRoute(
                  path: ':id',
                  builder: (_, state) =>
                      OrderDetailScreen(orderId: state.pathParameters['id']!),
                ),
              ],
            ),
            GoRoute(path: '/doctors', builder: (_, __) => const DoctorsScreen()),
            GoRoute(
              path: '/doctors/:id',
              builder: (_, state) => DoctorDetailResolver(doctorId: state.pathParameters['id']!),
            ),
            GoRoute(
              path: '/presentations',
              builder: (_, __) => const PresentationsScreen(),
              routes: [
                GoRoute(
                  path: ':id',
                  builder: (_, state) =>
                      PresentationBuilderScreen(presentationId: state.pathParameters['id']!),
                ),
              ],
            ),
            GoRoute(path: '/team', builder: (_, __) => const TeamScreen()),
            // Retailers: a partner's shops, and their orders to the partner.
            GoRoute(path: '/retailers', builder: (_, __) => const RetailersScreen()),
            GoRoute(
              path: '/retailer-orders',
              builder: (_, __) => const RetailerOrdersScreen(),
              routes: [
                GoRoute(
                  path: ':id',
                  builder: (_, state) => RetailerOrderDetailScreen(orderId: state.pathParameters['id']!),
                ),
              ],
            ),
            GoRoute(
              path: '/team/:id',
              builder: (_, state) => TeamMemberDetailScreen(member: state.extra as TeamMember),
            ),
            GoRoute(path: '/team-attendance', builder: (_, __) => const TeamAttendanceScreen()),
            GoRoute(path: '/team-logs', builder: (_, __) => const TeamLogsScreen()),
            GoRoute(path: '/my-attendance', builder: (_, __) => const MyAttendanceScreen()),
            GoRoute(path: '/my-daily-log', builder: (_, __) => const MyDailyLogScreen()),
            GoRoute(
              path: '/meetings',
              builder: (_, state) => MeetingsScreen(
                preselectedDoctorId: state.uri.queryParameters['doctor_id'],
              ),
            ),
            // No per-meeting detail screen exists — meetings are only ever
            // viewed inline in the list — so a meeting-reminder deep link
            // (/meetings/:id) just lands on the list instead of 404ing.
            GoRoute(path: '/meetings/:id', redirect: (_, __) => '/meetings'),
            GoRoute(path: '/requests', builder: (_, __) => const RequestsScreen()),
            GoRoute(
              path: '/chat',
              builder: (_, state) => ChatListScreen(initialConversationId: state.uri.queryParameters['conversation']),
            ),
            GoRoute(
              path: '/chat/:id',
              builder: (_, state) => ChatThreadResolver(id: state.pathParameters['id']!),
            ),
            GoRoute(path: '/favorites', builder: (_, __) => const FavoritesScreen()),
            GoRoute(path: '/payments', builder: (_, __) => const PaymentsScreen()),
            GoRoute(path: '/learning', builder: (_, __) => const LearningScreen()),
            GoRoute(path: '/admin', builder: (_, __) => const AdminDashboardScreen()),
            // staff orders, as on the website (orders_view / orders_edit)
            GoRoute(path: '/admin/orders', builder: (_, __) => const AdminOrdersScreen()),
            GoRoute(
              path: '/admin/orders/:id',
              builder: (_, state) => AdminOrderDetailScreen(orderId: state.pathParameters['id']!),
            ),
            GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
            GoRoute(path: '/notifications', builder: (_, __) => const NotificationsScreen()),
            ..._divisionRoutes,
          ],
        ),
      ],
    );

    return MaterialApp.router(
      debugShowCheckedModeBanner: false,
      title: 'Moulins',
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF00A6A4)),
        scaffoldBackgroundColor: Colors.white,
        appBarTheme: const AppBarTheme(
          centerTitle: false,
          scrolledUnderElevation: 0,
          backgroundColor: Colors.white,
          foregroundColor: Colors.black,
        ),
      ),
      routerConfig: router,
    );
  }
}

// Same 12 divisions as the website, each with its own hero banner + a
// products list filtered to its category — sharing one screen widget.
// Division data itself lives in data/divisions.dart, shared with AppDrawer.
final List<GoRoute> _divisionRoutes = kDivisions
    .map((d) => GoRoute(
          path: d.route,
          builder: (_, __) => DivisionLandingScreen(
            heroLabel: d.heroLabel,
            heroTitle: d.heroTitle,
            heroImage: d.heroImage,
            category: d.category,
            categoryId: d.categoryId,
          ),
        ))
    .toList();

class _AppShell extends ConsumerStatefulWidget {
  final Widget child;
  final String location;

  const _AppShell({required this.child, required this.location});

  @override
  ConsumerState<_AppShell> createState() => _AppShellState();
}

class _NavItem {
  final String route;
  final IconData icon;
  final IconData selectedIcon;
  final String label;
  const _NavItem({required this.route, required this.icon, required this.selectedIcon, required this.label});
}

const _teal = Color(0xFF00A6A4);

class _AppShellState extends ConsumerState<_AppShell> {
  // Opens the page of a tapped notification (notification_links.dart) once
  // the app is up and logged in.
  void _openPendingLink() {
    final route = NotificationLinks.pending.value;
    if (route == null || !mounted || ref.read(authProvider).user == null) return;
    NotificationLinks.pending.value = null;
    context.push(route);
  }

  @override
  void dispose() {
    NotificationLinks.pending.removeListener(_openPendingLink);
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    NotificationLinks.pending.addListener(_openPendingLink);
    // a tap that launched the app was recorded before this frame existed
    WidgetsBinding.instance.addPostFrameCallback((_) => _openPendingLink());
    Future.microtask(() =>
        ref.read(authProvider.notifier).loadUser().catchError((_) {}));
    Future.microtask(() => ref.read(notificationsProvider.notifier).load());
    Future.microtask(() => ref.read(cartProvider.notifier).loadFromServer());
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    if (user == null) {
      WidgetsBinding.instance
          .addPostFrameCallback((_) => context.go('/login'));
      return const Scaffold(
        body: Center(
            child: CircularProgressIndicator(color: Color(0xFF00A6A4))),
      );
    }

    // "My Doctors" is a personal doctor-tracking list, which only makes
    // sense for partners and their team members (medical reps track
    // meetings differently) — team members see their owning partner's
    // doctors, resolved server-side. Not shown to admin/employee logins.
    final isPartner = user.role == 'partner' || user.role == 'team_member';
    // Doctor logins are catalog-browsing only — no meetings/doctor-CRM
    // tracking, no order placement.
    final isDoctor = user.role == 'doctor';
    // Retailers order from their partner, not Moulins: their Orders tab is
    // their orders to the partner, and there are no meetings.
    final isRetailer = user.role == 'retailer';
    final destinations = <_NavItem>[
      const _NavItem(route: '/home', icon: Icons.home_outlined, selectedIcon: Icons.home, label: 'Home'),
      const _NavItem(route: '/products', icon: Icons.medication_outlined, selectedIcon: Icons.medication, label: 'Products'),
      if (isPartner)
        const _NavItem(route: '/doctors', icon: Icons.people_outlined, selectedIcon: Icons.people, label: 'Doctors'),
      if (!isDoctor && !isRetailer)
        const _NavItem(route: '/meetings', icon: Icons.calendar_today_outlined, selectedIcon: Icons.calendar_today, label: 'Meetings'),
      if (!isDoctor && !isRetailer)
        const _NavItem(route: '/orders', icon: Icons.receipt_long_outlined, selectedIcon: Icons.receipt_long, label: 'Orders'),
      if (isRetailer)
        const _NavItem(route: '/retailer-orders', icon: Icons.receipt_long_outlined, selectedIcon: Icons.receipt_long, label: 'My Orders'),
      if (user.role == 'admin' || user.role == 'employee')
        const _NavItem(route: '/admin', icon: Icons.admin_panel_settings_outlined, selectedIcon: Icons.admin_panel_settings, label: 'Admin'),
    ];

    var selectedIndex = destinations.indexWhere((d) => widget.location.startsWith(d.route));
    if (selectedIndex < 0) selectedIndex = 0;

    return Scaffold(
      body: widget.child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: selectedIndex,
        onDestinationSelected: (i) => context.go(destinations[i].route),
        backgroundColor: Colors.white,
        indicatorColor: _teal.withValues(alpha: 0.15),
        destinations: [
          for (final d in destinations)
            NavigationDestination(
              icon: Icon(d.icon),
              selectedIcon: Icon(d.selectedIcon, color: _teal),
              label: d.label,
            ),
        ],
      ),
    );
  }
}
