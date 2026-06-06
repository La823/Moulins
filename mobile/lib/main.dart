import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'providers/auth_provider.dart';
import 'screens/login/login_screen.dart';
import 'screens/products/products_screen.dart';
import 'screens/products/product_detail_screen.dart';
import 'screens/orders/orders_screen.dart';
import 'screens/orders/order_detail_screen.dart';
import 'screens/doctors/doctors_screen.dart';
import 'screens/cart/cart_screen.dart';
import 'screens/home/profile_screen.dart';
import 'screens/onboarding/onboarding_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

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
            GoRoute(
              path: '/products',
              builder: (_, __) => const ProductsScreen(),
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
            GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
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

class _AppShell extends ConsumerStatefulWidget {
  final Widget child;
  final String location;

  const _AppShell({required this.child, required this.location});

  @override
  ConsumerState<_AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<_AppShell> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() =>
        ref.read(authProvider.notifier).loadUser().catchError((_) {}));
  }

  int get _selectedIndex {
    if (widget.location.startsWith('/orders')) return 1;
    if (widget.location.startsWith('/doctors')) return 2;
    if (widget.location.startsWith('/profile')) return 3;
    return 0;
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

    return Scaffold(
      body: widget.child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _selectedIndex,
        onDestinationSelected: (i) {
          switch (i) {
            case 0: context.go('/products');
            case 1: context.go('/orders');
            case 2: context.go('/doctors');
            case 3: context.go('/profile');
          }
        },
        backgroundColor: Colors.white,
        indicatorColor: const Color(0xFF00A6A4).withValues(alpha: 0.15),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.medication_outlined),
            selectedIcon: Icon(Icons.medication, color: Color(0xFF00A6A4)),
            label: 'Products',
          ),
          NavigationDestination(
            icon: Icon(Icons.receipt_long_outlined),
            selectedIcon: Icon(Icons.receipt_long, color: Color(0xFF00A6A4)),
            label: 'Orders',
          ),
          NavigationDestination(
            icon: Icon(Icons.people_outlined),
            selectedIcon: Icon(Icons.people, color: Color(0xFF00A6A4)),
            label: 'Doctors',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outlined),
            selectedIcon: Icon(Icons.person, color: Color(0xFF00A6A4)),
            label: 'Profile',
          ),
        ],
      ),
    );
  }
}
