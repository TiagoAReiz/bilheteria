import { newEventSchema, toCreateEventRequest } from "../types/new-event.schema";

const valid = {
  name: "Show",
  description: "",
  location: "Arena",
  starts_at: "2099-06-01T20:00",
  capacity: 100,
};

function issues(values: unknown) {
  const r = newEventSchema.safeParse(values);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}

describe("newEventSchema", () => {
  it("aceita valores válidos", () => {
    expect(issues(valid)).toEqual([]);
  });

  it("exige nome e local", () => {
    expect(issues({ ...valid, name: " ", location: "" })).toEqual([
      "name: Informe o nome do evento",
      "location: Informe o local",
    ]);
  });

  it("exige data futura", () => {
    expect(issues({ ...valid, starts_at: "2000-01-01T10:00" })).toEqual(["starts_at: A data precisa ser no futuro"]);
  });

  it.each([
    [0, "capacity: A capacidade mínima é 1"],
    [100001, "capacity: A capacidade máxima é 100.000"],
    [1.5, "capacity: A capacidade deve ser um número inteiro"],
    [Number.NaN, "capacity: Informe a capacidade"],
  ])("valida capacidade %p", (capacity, msg) => {
    expect(issues({ ...valid, capacity })).toEqual([msg]);
  });

  it("toCreateEventRequest converte a data para ISO e omite descrição vazia", () => {
    const body = toCreateEventRequest(valid);
    expect(body).toEqual({
      name: "Show",
      description: undefined,
      location: "Arena",
      starts_at: new Date("2099-06-01T20:00").toISOString(),
      capacity: 100,
    });
  });
});
