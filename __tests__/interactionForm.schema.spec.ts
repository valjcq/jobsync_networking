import { InteractionFormSchema } from "@/models/interactionForm.schema";

const valid = {
  contact: "c1",
  interactionPurpose: "p1",
  occurredAt: new Date("2026-09-10T00:00:00"),
};

describe("InteractionFormSchema", () => {
  it("accepts a contact, a purpose and a date on their own", () => {
    expect(InteractionFormSchema.safeParse(valid).success).toBe(true);
  });

  it.each(["contact", "interactionPurpose"])("requires %s", (key) => {
    expect(
      InteractionFormSchema.safeParse({ ...valid, [key]: "" }).success,
    ).toBe(false);
  });

  it("requires a date", () => {
    const { occurredAt: _omit, ...rest } = valid;
    expect(InteractionFormSchema.safeParse(rest).success).toBe(false);
  });

  it("accepts a planned interaction dated in the future", () => {
    const future = new Date();
    future.setDate(future.getDate() + 10);
    expect(
      InteractionFormSchema.safeParse({ ...valid, occurredAt: future }).success,
    ).toBe(true);
  });

  it("needs a step description when a step date is given", () => {
    const res = InteractionFormSchema.safeParse({
      ...valid,
      nextStep: "  ",
      nextStepDate: new Date("2026-09-12T00:00:00"),
    });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0].path).toEqual(["nextStep"]);
  });

  it("accepts a step with no date", () => {
    expect(
      InteractionFormSchema.safeParse({ ...valid, nextStep: "Send CV" }).success,
    ).toBe(true);
  });

  it("rejects a next step dated before the interaction", () => {
    const res = InteractionFormSchema.safeParse({
      ...valid,
      nextStep: "Send CV",
      nextStepDate: new Date("2026-09-09T00:00:00"),
    });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0].path).toEqual(["nextStepDate"]);
  });

  it("accepts a next step on the same day", () => {
    expect(
      InteractionFormSchema.safeParse({
        ...valid,
        nextStep: "Send CV",
        nextStepDate: new Date("2026-09-10T00:00:00"),
      }).success,
    ).toBe(true);
  });
});
