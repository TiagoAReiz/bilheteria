import { makeEvent } from "@test/helpers";
import {
  centsToReaisInput,
  makeEventSchema,
  newEventSchema,
  toCreateEventRequest,
  toEventFormValues,
} from "../types/new-event.schema";

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

  describe("edição (makeEventSchema com pisos)", () => {
    const edit = makeEventSchema({ minCapacity: 50, minTicketsPerCpf: 3 });
    const editIssues = (values: unknown) => {
      const r = edit.safeParse(values);
      return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    };

    it("aceita manter ou aumentar", () => {
      expect(editIssues({ ...valid, capacity: 50, max_tickets_per_cpf: 3 })).toEqual([]);
      expect(editIssues({ ...valid, capacity: 80, max_tickets_per_cpf: 10 })).toEqual([]);
    });

    it("recusa diminuir capacidade ou limite", () => {
      expect(editIssues({ ...valid, capacity: 49, max_tickets_per_cpf: 3 })).toEqual([
        "capacity: A capacidade não pode diminuir (mínimo 50)",
      ]);
      expect(editIssues({ ...valid, capacity: 50, max_tickets_per_cpf: 2 })).toEqual([
        "max_tickets_per_cpf: O limite por CPF não pode diminuir (mínimo 3)",
      ]);
    });
  });

  it("toEventFormValues converte o evento da API para o formulário", () => {
    const values = toEventFormValues(
      makeEvent({ description: null, price_cents: 123456, starts_at: new Date(2099, 5, 1, 20, 5).toISOString() }),
    );
    expect(values).toMatchObject({ description: "", price: "1234,56", starts_at: "2099-06-01T20:05" });
    expect(toEventFormValues(makeEvent({ price_cents: null })).price).toBe("");
  });

  it.each([
    [5000, "50,00"],
    [8990, "89,90"],
    [105, "1,05"],
  ])("centsToReaisInput(%p) = %p", (cents, text) => {
    expect(centsToReaisInput(cents)).toBe(text);
  });
});
