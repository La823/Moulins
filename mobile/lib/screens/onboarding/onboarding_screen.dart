import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/onboarding_provider.dart';
import 'license_upload_screen.dart';
import 'gst_upload_screen.dart';
import '../../utils/responsive.dart';

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(onboardingProvider.notifier).loadStatus();
    });
  }

  @override
  Widget build(BuildContext context) {
    final status = ref.watch(onboardingProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Complete Your Profile'),
        backgroundColor: Colors.white,
        foregroundColor: Colors.black,
        elevation: 0,
      ),
      body: status.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => Center(child: Text('Error: $err')),
        data: (data) => ResponsiveCenter(child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Progress Header
              Text(
                'Verification Journey',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 24),

              // Step Indicator
              _buildStepIndicator(data.onboardingStep),
              const SizedBox(height: 32),

              // Step Content
              if (data.onboardingStep == 1 || data.onboardingStep == 2) ...[
                _buildStepCard(
                  context,
                  step: 1,
                  title: 'Drug License',
                  description: 'Upload your drug license photo and details',
                  isCompleted: data.onboardingStep > 1,
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const LicenseUploadScreen()),
                    ).then((_) {
                      ref.read(onboardingProvider.notifier).loadStatus();
                    });
                  },
                ),
              ],

              if (data.onboardingStep >= 2 && data.onboardingStep <= 3) ...[
                const SizedBox(height: 16),
                _buildStepCard(
                  context,
                  step: 2,
                  title: 'GST Certificate',
                  description: 'Upload your GST photo and number',
                  isCompleted: data.onboardingStep > 3,
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const GSTUploadScreen()),
                    ).then((_) {
                      ref.read(onboardingProvider.notifier).loadStatus();
                    });
                  },
                ),
              ],

              if (data.onboardingStep == 4) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.green.shade50,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.green.shade300),
                  ),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.green,
                          borderRadius: BorderRadius.circular(50),
                        ),
                        child: const Icon(Icons.check, color: Colors.white, size: 20),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Verification Complete!',
                              style: TextStyle(fontWeight: FontWeight.bold, color: Colors.green),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Your documents have been verified',
                              style: TextStyle(fontSize: 12, color: Colors.green.shade700),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 24),

              // Document Status List
              if (data.documents.isNotEmpty) ...[
                const Text('Document Status', style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 12),
                ...data.documents.map((doc) => _buildDocumentStatusCard(doc)).toList(),
              ],
            ],
          ),
        )),
      ),
    );
  }

  Widget _buildStepIndicator(int currentStep) {
    final steps = [
      {'num': 1, 'title': 'Account Created', 'completed': currentStep > 1},
      {'num': 2, 'title': 'License Verified', 'completed': currentStep > 2},
      {'num': 3, 'title': 'GST Verified', 'completed': currentStep > 3},
    ];

    return Column(
      children: [
        Row(
          children: List.generate(
            steps.length,
            (i) => Expanded(
              child: Row(
                children: [
                  // Circle
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: steps[i]['completed'] as bool ? const Color(0xFF00A6A4) : Colors.grey.shade200,
                      borderRadius: BorderRadius.circular(50),
                    ),
                    child: Center(
                      child: steps[i]['completed'] as bool
                          ? const Icon(Icons.check, color: Colors.white, size: 18)
                          : Text('${steps[i]['num']}', style: const TextStyle(fontWeight: FontWeight.bold)),
                    ),
                  ),
                  // Line (except last)
                  if (i < steps.length - 1) ...[
                    Expanded(
                      child: Container(
                        height: 2,
                        color: steps[i + 1]['completed'] as bool ? const Color(0xFF00A6A4) : Colors.grey.shade300,
                        margin: const EdgeInsets.symmetric(horizontal: 8),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: List.generate(
            steps.length,
            (i) => Expanded(
              child: Text(
                steps[i]['title'] as String,
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: Colors.grey.shade700),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildStepCard(BuildContext context, {
    required int step,
    required String title,
    required String description,
    required bool isCompleted,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: isCompleted ? Colors.green.shade50 : Colors.grey.shade50,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: isCompleted ? Colors.green.shade300 : Colors.grey.shade300),
        ),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: isCompleted ? Colors.green : const Color(0xFF00A6A4),
                borderRadius: BorderRadius.circular(50),
              ),
              child: Center(
                child: isCompleted
                    ? const Icon(Icons.check, color: Colors.white)
                    : Text('$step', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  const SizedBox(height: 4),
                  Text(description, style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                ],
              ),
            ),
            if (!isCompleted) const Icon(Icons.arrow_forward_ios, size: 16, color: Colors.grey),
          ],
        ),
      ),
    );
  }

  Widget _buildDocumentStatusCard(dynamic doc) {
    return Container(
      padding: const EdgeInsets.all(12),
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: doc['is_verified'] ? Colors.green.shade50 : Colors.orange.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: doc['is_verified'] ? Colors.green.shade300 : Colors.orange.shade300),
      ),
      child: Row(
        children: [
          Icon(
            doc['is_verified'] ? Icons.verified : Icons.pending,
            color: doc['is_verified'] ? Colors.green : Colors.orange,
            size: 20,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  doc['doc_type'] == 'LICENSE' ? 'Drug License' : 'GST Certificate',
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                ),
                Text(
                  doc['is_verified'] ? 'Verified' : doc['rejection_reason'] ?? 'Pending Review',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
