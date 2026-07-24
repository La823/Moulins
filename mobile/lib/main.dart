import 'dart:ui';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'providers/auth_provider.dart';
import 'providers/notification_provider.dart';
import 'services/local_notifications_service.dart';
import 'screens/login/login_screen.dart';
import 'screens/products/products_screen.dart';
import 'screens/products/product_detail_screen.dart';
import 'screens/orders/orders_screen.dart';
import 'screens/orders/order_detail_screen.dart';
import 'screens/doctors/doctors_screen.dart';
import 'screens/cart/cart_screen.dart';
import 'screens/home/home_screen.dart';
import 'screens/home/profile_screen.dart';
import 'screens/onboarding/onboarding_screen.dart';
import 'screens/notifications/notifications_screen.dart';
import 'screens/meetings/meetings_screen.dart';
import 'screens/requests/requests_screen.dart';
import 'screens/chat/chat_list_screen.dart';
import 'screens/products/favorites_screen.dart';
import 'screens/learning/learning_screen.dart';
import 'screens/admin/admin_dashboard_screen.dart';
import 'screens/divisions/division_landing_screen.dart';
import 'data/divisions.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  try {
    await Firebase.initializeApp();
    await LocalNotificationsService.init();
    FirebaseMessaging.onMessage.listen((message) {
      final notification = message.notification;
      if (notification != null) {
        LocalNotificationsService.show(
          title: notification.title ?? 'Moulins',
          body: notification.body ?? '',
          imageUrl: notification.android?.imageUrl ?? notification.apple?.imageUrl,
          notificationId: message.data['notification_id'],
        );
      }
    });
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
        ShellRoute(
          builder: (_, state, child) =>
              _AppShell(child: child, location: state.uri.path),
          routes: [
            GoRoute(path: '/home', builder: (_, __) => const HomeScreen()),
            GoRoute(
              path: '/products',
              builder: (_, state) => ProductsScreen(initialCategory: state.uri.queryParameters['category']),
              routes: [
                GoRoute(
                  path: ':id',
                  builder: (_, state) =>
                      ProductDetailScreen(productId: state.pathParameters['id']!),
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
              path: '/meetings',
              builder: (_, state) => MeetingsScreen(
                preselectedDoctorId: state.uri.queryParameters['doctor_id'],
              ),
            ),
            GoRoute(path: '/requests', builder: (_, __) => const RequestsScreen()),
            GoRoute(path: '/chat', builder: (_, __) => const ChatListScreen()),
            GoRoute(path: '/favorites', builder: (_, __) => const FavoritesScreen()),
            GoRoute(path: '/learning', builder: (_, __) => const LearningScreen()),
            GoRoute(path: '/admin', builder: (_, __) => const AdminDashboardScreen()),
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
  @override
  void initState() {
    super.initState();
    Future.microtask(() =>
        ref.read(authProvider.notifier).loadUser().catchError((_) {}));
    Future.microtask(() => ref.read(notificationsProvider.notifier).load());
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
    // sense for partners (medical reps track meetings differently) — not
    // shown to admin/employee logins at all.
    final isPartner = user.role == 'partner';
    final destinations = <_NavItem>[
      const _NavItem(route: '/home', icon: Icons.home_outlined, selectedIcon: Icons.home, label: 'Home'),
      const _NavItem(route: '/products', icon: Icons.medication_outlined, selectedIcon: Icons.medication, label: 'Products'),
      if (isPartner)
        const _NavItem(route: '/doctors', icon: Icons.people_outlined, selectedIcon: Icons.people, label: 'Doctors'),
      const _NavItem(route: '/meetings', icon: Icons.calendar_today_outlined, selectedIcon: Icons.calendar_today, label: 'Meetings'),
      const _NavItem(route: '/orders', icon: Icons.receipt_long_outlined, selectedIcon: Icons.receipt_long, label: 'Orders'),
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
