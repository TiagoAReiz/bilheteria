import { newEventSchema, toCreateEventRequest } from "../types/new-event.schema";

const valid = {
  name: "Show",
  description: "",
  location: "Arena",
  starts_at: "2099-06-01T20:00",
  capacity: 100,
  price: "50,00",
  max_tickets_per_cpf: 2,
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

  it.each([
    ["", "price: Informe o preço do ingresso"],
    ["abc", "price: Preço inválido. Use, por exemplo, 50,00"],
    ["-10", "price: Preço inválido. Use, por exemplo, 50,00"],
    ["10,999", "price: Preço inválido. Use, por exemplo, 50,00"],
    ["0,99", "price: O preço mínimo é R$ 1,00"],
    ["100.000,01", "price: O preço máximo é R$ 100.000,00"],
  ])("valida preço %p", (price, msg) => {
    expect(issues({ ...valid, price })).toEqual([msg]);
  });

  it.each(["1,00", "50", "R$ 1.234,56", "100.000,00"])("aceita preço %p", (price) => {
    expect(issues({ ...valid, price })).toEqual([]);
  });

  it("toCreateEventRequest converte a data para ISO e omite descrição vazia", () => {
    const body = toCreateEventRequest(valid);
    expect(body).toEqual({
      name: "Show",
      description: undefined,
      location: "Arena",
      starts_at: new Date("2099-06-01T20:00").toISOString(),
      capacity: 100,
      price_cents: 5000,
      max_tickets_per_cpf: 2,
    });
  });

  it.each([
    [0, "max_tickets_per_cpf: O limite mínimo é 1"],
    [11, "max_tickets_per_cpf: O limite máximo é 10"],
    [1.5, "max_tickets_per_cpf: O limite deve ser um número inteiro"],
    [Number.NaN, "max_tickets_per_cpf: Informe o limite por CPF"],
  ])("valida limite por CPF %p", (max_tickets_per_cpf, msg) => {
    expect(issues({ ...valid, max_tickets_per_cpf })).toEqual([msg]);
  });

  it.each([1, 10])("aceita limite por CPF %p", (max_tickets_per_cpf) => {
    expect(issues({ ...valid, max_tickets_per_cpf })).toEqual([]);
  });

  it("limite por CPF não pode passar da capacidade", () => {
    expect(issues({ ...valid, capacity: 3, max_tickets_per_cpf: 4 })).toEqual([
      "max_tickets_per_cpf: O limite por CPF não pode ser maior que a capacidade",
    ]);
    expect(issues({ ...valid, capacity: 3, max_tickets_per_cpf: 3 })).toEqual([]);
  });
});
