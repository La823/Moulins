class DivisionInfo {
  final String route;
  final String heroLabel;
  final String heroTitle;
  final String heroImage;
  final String gridImage;
  final String category;

  const DivisionInfo({
    required this.route,
    required this.heroLabel,
    required this.heroTitle,
    required this.heroImage,
    required this.gridImage,
    required this.category,
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
  ),
  DivisionInfo(
    route: '/bonevoyage',
    heroLabel: 'Bone Voyage',
    heroTitle: 'Orthopaedic Care',
    heroImage: 'assets/images/division_bonevoyage.png',
    gridImage: 'assets/images/grid_bonevoyage.jpg',
    category: 'Bone Voyage (Orthopaedics)',
  ),
  DivisionInfo(
    route: '/fluidity',
    heroLabel: 'Fluidity',
    heroTitle: 'Urology & Renal Care',
    heroImage: 'assets/images/division_fluidity.png',
    gridImage: 'assets/images/grid_fluidity.jpg',
    category: 'Fluidity (Urology and renal)',
  ),
  DivisionInfo(
    route: '/gutsy',
    heroLabel: 'Gutsy',
    heroTitle: 'Gastroenterology Care',
    heroImage: 'assets/images/division_gutsy.png',
    gridImage: 'assets/images/grid_gutsy.jpg',
    category: 'Gutsy (Gastro)',
  ),
  DivisionInfo(
    route: '/jivya',
    heroLabel: 'Jivya',
    heroTitle: 'Cardio-Diabetic Care',
    heroImage: 'assets/images/division_jivya.jpg',
    gridImage: 'assets/images/grid_jivya.jpg',
    category: 'Jivya (Cardio Diabetic Division)',
  ),
  DivisionInfo(
    route: '/lifegard',
    heroLabel: 'Life Gard',
    heroTitle: 'Antibiotics & Trauma Care',
    heroImage: 'assets/images/division_lifegard.png',
    gridImage: 'assets/images/grid_lifegard.jpg',
    category: 'Life Gard (Antibiotics/ Trauma)',
  ),
  DivisionInfo(
    route: '/littleplanet',
    heroLabel: 'Little Planet',
    heroTitle: 'Pediatric Care',
    heroImage: 'assets/images/division_littleplanet.png',
    gridImage: 'assets/images/grid_littleplanet.jpg',
    category: 'Little Planet (Pediatric)',
  ),
  DivisionInfo(
    route: '/matrix',
    heroLabel: 'Matrix',
    heroTitle: 'General & Nutraceuticals',
    heroImage: 'assets/images/division_matrix.jpg',
    gridImage: 'assets/images/grid_matrix.jpg',
    category: 'Matrix',
  ),
  DivisionInfo(
    route: '/mindset',
    heroLabel: 'Mindset',
    heroTitle: 'Neurology & Psychiatry Care',
    heroImage: 'assets/images/division_mindset.png',
    gridImage: 'assets/images/grid_mindset.jpg',
    category: 'Mindset (Neuro/Psychiatry)',
  ),
  DivisionInfo(
    route: '/missbella',
    heroLabel: 'Missbella',
    heroTitle: 'Derma & Skin Wellness Care',
    heroImage: 'assets/images/division_missbella.png',
    gridImage: 'assets/images/grid_missbella.jpg',
    category: 'Missbella(Derma and Skin Wellness)',
  ),
  DivisionInfo(
    route: '/srishti',
    heroLabel: 'Srishti',
    heroTitle: 'Gynaecology Care',
    heroImage: 'assets/images/division_srishti.png',
    gridImage: 'assets/images/grid_srishti.jpg',
    category: 'Srishti (Gynaecology)',
  ),
  DivisionInfo(
    route: '/viewpoint',
    heroLabel: 'View Point',
    heroTitle: 'Ophthalmology Care',
    heroImage: 'assets/images/division_viewpoint.jpg',
    gridImage: 'assets/images/grid_viewpoint.jpg',
    category: 'View Point (Ophthalmology)',
  ),
];
