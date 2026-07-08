import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Top-right profile entry point, used consistently across the main tabs
/// now that Profile isn't a bottom-nav destination.
class ProfileButton extends StatelessWidget {
  const ProfileButton({super.key});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: const Icon(Icons.account_circle_outlined, color: Color(0xFF1A1A1A)),
      onPressed: () => context.push('/profile'),
      tooltip: 'Profile',
    );
  }
}
