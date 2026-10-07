import { levenshtein, scoreFields } from "@/lib/search/score";

const f = (text: string | null, weight = 1) => ({ text, weight });

describe("levenshtein", () => {
  it("counts edits and bails out past the max", () => {
    expect(levenshtein("acme", "acme", 1)).toBe(0);
    expect(levenshtein("engineer", "enginer", 1)).toBe(1);
    expect(levenshtein("engineer", "designer", 2)).toBeGreaterThan(2);
  });
});

describe("scoreFields", () => {
  it("ranks exact above prefix above all-tokens above fuzzy", () => {
    const exact = scoreFields("data engineer", [f("Data Engineer")])!;
    const prefix = scoreFields("data", [f("Data Engineer")])!;
    const tokens = scoreFields("engineer data", [f("Data Engineer")])!;
    const fuzzy = scoreFields("data enginer", [f("Data Engineer")])!;
    expect([exact.kind, prefix.kind, tokens.kind, fuzzy.kind]).toEqual([
      "exact",
      "prefix",
      "tokens",
      "fuzzy",
    ]);
    expect(exact.score).toBeGreaterThan(prefix.score);
    expect(prefix.score).toBeGreaterThan(tokens.score);
    expect(tokens.score).toBeGreaterThan(fuzzy.score);
  });

  it("folds case and diacritics", () => {
    expect(scoreFields("jose garcia", [f("José García")])?.kind).toBe("exact");
    expect(scoreFields("JOSÉ", [f("jose garcia")])?.kind).toBe("prefix");
  });

  it("ignores a trailing legal suffix on the field", () => {
    expect(scoreFields("acme", [f("Acme Inc.")])?.kind).toBe("exact");
  });

  it("matches a query spread across fields, below a single-field match", () => {
    const spread = scoreFields("acme data", [f("Data Engineer"), f("Acme")])!;
    expect(spread.kind).toBe("tokens");
    const single = scoreFields("acme", [f("Data Engineer"), f("Acme")])!;
    expect(single.score).toBeGreaterThan(spread.score);
  });

  it("tolerates a typo in a long word but not in a short one", () => {
    expect(scoreFields("enginer", [f("Engineer")])?.kind).toBe("fuzzy");
    expect(scoreFields("acmee", [f("Acme")])?.kind).toBe("fuzzy");
    expect(scoreFields("sam", [f("Sal")])).toBeNull();
    expect(scoreFields("ai", [f("at")])).toBeNull();
  });

  it("weights primary fields above secondary ones", () => {
    const name = scoreFields("acme", [f("Acme", 1)])!;
    const other = scoreFields("acme", [f("Acme", 0.45)])!;
    expect(name.score).toBeGreaterThan(other.score);
  });

  it("returns null for no match or an empty query", () => {
    expect(scoreFields("zebra", [f("Data Engineer")])).toBeNull();
    expect(scoreFields("  ", [f("Data Engineer")])).toBeNull();
    expect(scoreFields("acme", [f(null), f("")])).toBeNull();
  });
});
