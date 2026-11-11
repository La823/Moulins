import 'package:flutter_test/flutter_test.dart';
import 'package:moulins/services/product_search.dart';

void main() {
  // what Postgres pg_trgm word_similarity gives for the same pairs, so
  // offline search finds what the website finds
  test('word_similarity matches pg_trgm', () {
    const pg = {
      ('word', 'two words'): 0.80,
      ('paracetmol', 'Paracetamol 500mg Tablet'): 0.64,
      ('amoxcilin', 'Amoxicillin + Clavulanic Acid'): 0.47,
      ('dolo', 'DOLO 650'): 1.00,
      ('cefixme', 'Cefixime 200 mg'): 0.62,
      ('pantop', 'Pantoprazole 40mg Inj'): 0.86,
      ('vit d3', 'Cholecalciferol (Vitamin D3) 60000 IU'): 0.50,
      ('azithro 500', 'Azithromycin 500mg'): 0.58,
    };
    pg.forEach((pair, want) {
      expect(ProductSearch.wordSimilarity(pair.$1, pair.$2), closeTo(want, 0.006), reason: '$pair');
    });
  });
}
