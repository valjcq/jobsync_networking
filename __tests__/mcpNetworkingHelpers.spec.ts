import {
  formatDateOnly,
  parseDateOnly,
  todayLocalMidnight,
} from "@/lib/networking/dateOnly";
import {
  findDuplicateContacts,
  formatContactCandidate,
  matchContactsByName,
  normalizeLinkedinUrl,
  type ContactIndexRow,
} from "@/lib/networking/contactMatch";

const row = (over: Partial<ContactIndexRow> = {}): ContactIndexRow => ({
  id: "c1",
  name: "Sam Lee",
  email: null,
  linkedinUrl: null,
  lastContactedAt: null,
  company: null,
  ...over,
});

describe("parseDateOnly", () => {
  it("parses YYYY-MM-DD as server-local midnight", () => {
    const d = parseDateOnly("2026-09-10", "occurredAt");
    expect(d.getTime()).toBe(new Date(2026, 8, 10, 0, 0, 0, 0).getTime());
  });

  it.each(["2026-9-1", "10/09/2026", "next Tuesday", "", "2026-09-10T10:00:00Z", "2026-02-30", "2026-13-01"])(
    "rejects %j with a message naming the field and the expected format",
    (bad) => {
      expect(() => parseDateOnly(bad, "occurredAt")).toThrow(
        /occurredAt must be a calendar date in YYYY-MM-DD format/,
      );
    },
  );

  it("accepts a real leap day and rejects a fake one", () => {
    expect(() => parseDateOnly("2028-02-29", "d")).not.toThrow();
    expect(() => parseDateOnly("2027-02-29", "d")).toThrow();
  });

  it("round-trips through formatDateOnly", () => {
    expect(formatDateOnly(parseDateOnly("2026-01-05", "d"))).toBe("2026-01-05");
  });

  it("todayLocalMidnight has no time component", () => {
    const d = todayLocalMidnight();
    expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([0, 0, 0, 0]);
  });
});

describe("normalizeLinkedinUrl", () => {
  it("ignores scheme, www, trailing slash and case", () => {
    expect(normalizeLinkedinUrl("https://www.LinkedIn.com/in/Sam-Lee/")).toBe(
      normalizeLinkedinUrl("http://linkedin.com/in/sam-lee"),
    );
  });

  it("keeps different profiles apart", () => {
    expect(normalizeLinkedinUrl("https://linkedin.com/in/a")).not.toBe(
      normalizeLinkedinUrl("https://linkedin.com/in/b"),
    );
  });
});

describe("matchContactsByName", () => {
  const index = [
    row({ id: "1", name: "Sam Lee" }),
    row({ id: "2", name: "Samuel Lee" }),
    row({ id: "3", name: "José García" }),
  ];

  it("matches exactly, folding case, spacing and diacritics", () => {
    expect(matchContactsByName(index, "  sam   LEE ").exact.map((c) => c.id)).toEqual(["1"]);
    expect(matchContactsByName(index, "jose garcia").exact.map((c) => c.id)).toEqual(["3"]);
  });

  it("never treats a prefix as exact: 'Sam' is only a partial match", () => {
    const res = matchContactsByName(index, "Sam");
    expect(res.exact).toEqual([]);
    expect(res.partial.map((c) => c.id)).toEqual(["1", "2"]);
  });

  it("requires every word of the query to appear for a partial match", () => {
    expect(matchContactsByName(index, "Samuel Garcia")).toEqual({ exact: [], partial: [] });
  });

  it("returns both exact matches when two contacts share a name", () => {
    const twins = [row({ id: "a" }), row({ id: "b" })];
    expect(matchContactsByName(twins, "Sam Lee").exact).toHaveLength(2);
  });

  it("matches nothing for an empty query", () => {
    expect(matchContactsByName(index, "   ")).toEqual({ exact: [], partial: [] });
  });
});

describe("findDuplicateContacts", () => {
  it("reports each reason it matched on", () => {
    const index = [
      row({ id: "1", email: "sam@x.com", linkedinUrl: "https://linkedin.com/in/sam" }),
    ];
    const [m] = findDuplicateContacts(index, {
      name: "sam lee",
      email: "SAM@x.com",
      linkedinUrl: "http://www.linkedin.com/in/sam/",
    });
    expect(m.reasons).toEqual(["same name", "same email", "same LinkedIn URL"]);
  });

  it("matches on email or LinkedIn alone, even under a different name", () => {
    const index = [row({ id: "1", name: "Someone Else", email: "sam@x.com" })];
    expect(findDuplicateContacts(index, { name: "Sam Lee", email: "sam@x.com" })[0].reasons).toEqual(["same email"]);
  });

  it("does not treat empty email/LinkedIn as equal", () => {
    expect(findDuplicateContacts([row({ name: "Other" })], { name: "Sam Lee", email: "", linkedinUrl: "" })).toEqual([]);
  });
});

describe("formatContactCandidate", () => {
  it("shows id, company and last contacted", () => {
    const text = formatContactCandidate(
      row({ id: "c9", company: "Acme", lastContactedAt: new Date(2026, 8, 1) }),
    );
    expect(text).toBe("Sam Lee (id: c9, Acme, last contacted: 2026-09-01)");
  });

  it("says never when there has been no contact", () => {
    expect(formatContactCandidate(row())).toContain("last contacted: never");
  });
});
