import '../models/product.dart';

/// The website's product search (backend models/productModel.go,
/// GetAllProductsWithSuggestion), run on the phone over saved products so
/// search works offline and finds the same products:
///  1. the search text inside the name or salt (key ingredients), by name;
///  2. if nothing matches, close spellings: Postgres pg_trgm's
///     word_similarity of at least 0.4, the closest first;
///  3. "did you mean": the 5 real words (over 3 letters, from names and
///     salts) closest to the search.
class ProductSearch {
  // the backend's pg_trgm.word_similarity_threshold (database/connection.go)
  static const threshold = 0.4;

  static ({List<Product> products, List<String> suggestions}) run(List<Product> all, String search,
      {bool saltOnly = false}) {
    final q = search.trim();
    if (q.isEmpty) {
      return (products: [...all]..sort(_byName), suggestions: const []);
    }
    final lower = q.toLowerCase();
    List<String> fields(Product p) => saltOnly ? [p.keyIngredients ?? ''] : [p.name, p.keyIngredients ?? ''];

    var found = all.where((p) => fields(p).any((f) => f.toLowerCase().contains(lower))).toList()..sort(_byName);
    if (found.isEmpty) {
      final scored = <(Product, double)>[];
      for (final p in all) {
        var best = 0.0;
        for (final f in fields(p)) {
          final s = wordSimilarity(q, f, atLeast: threshold);
          if (s > best) best = s;
        }
        if (best >= threshold) scored.add((p, best));
      }
      scored.sort((a, b) => b.$2.compareTo(a.$2));
      found = scored.map((e) => e.$1).toList();
    }
    return (products: found, suggestions: found.isEmpty ? const <String>[] : suggest(all, q));
  }

  static int _byName(Product a, Product b) => a.name.toLowerCase().compareTo(b.name.toLowerCase());

  /// The 5 words from [all]'s names and salts closest to [term], leaving out
  /// the term itself.
  static List<String> suggest(List<Product> all, String term) {
    final words = <String>{};
    for (final p in all) {
      for (final w in '${p.name} ${p.keyIngredients ?? ''}'.split(RegExp(r'[^a-zA-Z0-9]+'))) {
        if (w.length > 3) words.add(w);
      }
    }
    final scored = [for (final w in words) (w, wordSimilarity(term, w))]..sort((a, b) => b.$2.compareTo(a.$2));
    return scored.take(5).map((e) => e.$1).where((w) => w.toLowerCase() != term.toLowerCase()).toList();
  }

  // pg_trgm's trigrams: lower case, words are runs of letters and digits,
  // each padded as "  word " and cut into every 3 characters, in order
  static List<String> _trigrams(String s) {
    final out = <String>[];
    for (final m in RegExp(r'[a-z0-9]+').allMatches(s.toLowerCase())) {
      final w = '  ${m.group(0)} ';
      for (var i = 0; i + 3 <= w.length; i++) {
        out.add(w.substring(i, i + 3));
      }
    }
    return out;
  }

  /// pg_trgm word_similarity(a, b): the best, over every run of b's trigrams
  /// in order, of shared / (a's trigrams + the run's - shared). With
  /// [atLeast], 0 as soon as b can't reach it (quicker over many products).
  static double wordSimilarity(String a, String b, {double atLeast = 0}) {
    final ta = _trigrams(a).toSet();
    if (ta.isEmpty) return 0;
    final seq = _trigrams(b);
    // no run can share more than the whole of b does
    final shared = seq.toSet().where(ta.contains).length;
    if (shared == 0 || shared / ta.length < atLeast) return 0;
    var best = 0.0;
    for (var i = 0; i < seq.length; i++) {
      if (!ta.contains(seq[i])) continue; // the best run starts on a shared trigram
      final seen = <String>{};
      var common = 0;
      for (var j = i; j < seq.length; j++) {
        if (seen.add(seq[j]) && ta.contains(seq[j])) common++;
        final s = common / (ta.length + seen.length - common);
        if (s > best) best = s;
      }
      if (best >= 1) return 1;
    }
    return best;
  }
}
