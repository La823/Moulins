class DivisionInfo {
  final String route;
  final String heroLabel;
  final String heroTitle;
  final String heroImage;
  final String gridImage;
  final String category;
  /// The category's uuid. Filtering keys off this rather than `category`:
  /// a uuid never changes, so renaming a category cannot empty a division
  /// again the way "Missbella" -> "Misbella" did.
  final String categoryId;

  const DivisionInfo({
    required this.route,
    required this.heroLabel,
    required this.heroTitle,
    required this.heroImage,
    required this.gridImage,
    required this.category,
    required this.categoryId,
  });
}

// Same 12 divisions as the website, in the same order. heroImage is the
// landing-page banner (from frontend/public/pages); gridImage is the square
// filter-style tile used on the home page grid (from
// frontend/public/moulins divisions).
const List<DivisionInfo> kDivisions = [
  DivisionInfo(
    route: '/aerozone',
    heroLabel: 'Aerozone',
    heroTitle: 'Respiratory & ENT Care',
    heroImage: 'assets/images/division_aerozone.jpg',
    gridImage: 'assets/images/grid_aerozone.jpg',
    category: 'Aerozone(Respiratory & ENT)',
    categoryId: 'a75b6d1e-b867-45ac-9545-5ad7c0d8af4c',
  ),
  DivisionInfo(
    route: '/bonevoyage',
    heroLabel: 'Bone Voyage',
    heroTitle: 'Orthopaedic Care',
    heroImage: 'assets/images/division_bonevoyage.png',
    gridImage: 'assets/images/grid_bonevoyage.jpg',
    category: 'Bone Voyage (Orthopaedics)',
    categoryId: 'e6d5fbe4-7e5e-4589-9f53-538d166773e6',
  ),
  DivisionInfo(
    route: '/fluidity',
    heroLabel: 'Fluidity',
    heroTitle: 'Urology & Renal Care',
    heroImage: 'assets/images/division_fluidity.png',
    gridImage: 'assets/images/grid_fluidity.jpg',
    category: 'Fluidity (Urology and renal)',
    categoryId: '88af1ce9-be74-4aa5-8433-059a8ba1aeb4',
  ),
  DivisionInfo(
    route: '/gutsy',
    heroLabel: 'Gutsy',
    heroTitle: 'Gastroenterology Care',
    heroImage: 'assets/images/division_gutsy.png',
    gridImage: 'assets/images/grid_gutsy.jpg',
    category: 'Gutsy (Gastro)',
    categoryId: '4d364d05-5c3e-4191-936c-f9c92cd2c773',
  ),
  DivisionInfo(
    route: '/jivya',
    heroLabel: 'Jivya',
    heroTitle: 'Cardio-Diabetic Care',
    heroImage: 'assets/images/division_jivya.jpg',
    gridImage: 'assets/images/grid_jivya.jpg',
    category: 'Jivya (Cardio Diabetic Division)',
    categoryId: '4bfa533e-7005-4bb5-ae06-184a0ee54dd6',
  ),
  DivisionInfo(
    route: '/lifegard',
    heroLabel: 'Life Gard',
    heroTitle: 'Antibiotics & Trauma Care',
    heroImage: 'assets/images/division_lifegard.png',
    gridImage: 'assets/images/grid_lifegard.jpg',
    category: 'Life Gard (Antibiotics/ Trauma)',
    categoryId: 'f6ac3776-65b5-4741-9c78-e4114335924c',
  ),
  DivisionInfo(
    route: '/littleplanet',
    heroLabel: 'Little Planet',
    heroTitle: 'Pediatric Care',
    heroImage: 'assets/images/division_littleplanet.png',
    gridImage: 'assets/images/grid_littleplanet.jpg',
    category: 'Little Planet (Pediatric)',
    categoryId: '548feaf0-b5ae-4b93-a328-54a7b236cd7b',
  ),
  DivisionInfo(
    route: '/matrix',
    heroLabel: 'Matrix',
    heroTitle: 'General & Nutraceuticals',
    heroImage: 'assets/images/division_matrix.jpg',
    gridImage: 'assets/images/grid_matrix.jpg',
    category: 'Matrix',
    categoryId: '36e52f50-5175-44cb-aa26-eeb00be9604b',
  ),
  DivisionInfo(
    route: '/mindset',
    heroLabel: 'Mindset',
    heroTitle: 'Neurology & Psychiatry Care',
    heroImage: 'assets/images/division_mindset.png',
    gridImage: 'assets/images/grid_mindset.jpg',
    category: 'Mindset (Neuro/Psychiatry)',
    categoryId: '719a26e6-e368-4722-a17d-ac05f197817e',
  ),
  DivisionInfo(
    route: '/missbella',
    heroLabel: 'Misbella',
    heroTitle: 'Derma & Skin Wellness Care',
    heroImage: 'assets/images/division_missbella.png',
    gridImage: 'assets/images/grid_missbella.jpg',
    category: 'Misbella (Derma and Skin Wellness)',
    categoryId: '9e1eabdb-d599-416c-9c99-8b92b0924ce1',
  ),
  DivisionInfo(
    route: '/srishti',
    heroLabel: 'Srishti',
    heroTitle: 'Gynaecology Care',
    heroImage: 'assets/images/division_srishti.png',
    gridImage: 'assets/images/grid_srishti.jpg',
    category: 'Srishti (Gynaecology)',
    categoryId: '1fc039cc-910a-4ef3-aac7-6e8d64d28293',
  ),
  DivisionInfo(
    route: '/viewpoint',
    heroLabel: 'View Point',
    heroTitle: 'Ophthalmology Care',
    heroImage: 'assets/images/division_viewpoint.jpg',
    gridImage: 'assets/images/grid_viewpoint.jpg',
    category: 'View Point (Ophthalmology)',
    categoryId: '6202edc9-44e5-46d7-8f40-347649932c96',
  ),
];
