import { formatBRL, parseReaisToCents } from "@/shared/lib/money";

// Intl usa espaço não separável entre "R$" e o número
const normalize = (value: string) => value.replace(/ /g, " ");

describe("money", () => {
  it.each([
    [5000, "R$ 50,00"],
    [8990, "R$ 89,90"],
    [123456, "R$ 1.234,56"],
    [100, "R$ 1,00"],
  ])("formatBRL(%d) = %s", (cents, text) => {
    expect(normalize(formatBRL(cents))).toBe(text);
  });

  it.each([
    ["50", 5000],
    ["50,5", 5050],
    ["50,50", 5050],
    ["89,90", 8990],
    ["1.234,56", 123456],
    ["1.234", 123400],
    ["50.00", 5000],
    ["1.5", 150],
    ["R$ 10,00", 1000],
    ["  7,00  ", 700],
  ])("parseReaisToCents(%p) = %d", (input, cents) => {
    expect(parseReaisToCents(input)).toBe(cents);
  });

  it.each([
    "",
    "abc",
    "-10",
    "10,999",
    "1,2,3",
    "12.34.56",
    "1.23,4",
    "1e3",
    "1234567890",
  ])("parseReaisToCents(%p) = null", (input) => {
    expect(parseReaisToCents(input)).toBeNull();
  });

  it("não perde centavos com valores que dão erro em float", () => {
    // 0.1 + 0.2 em float = 0.30000000000000004
    expect(parseReaisToCents("0,29")).toBe(29);
    expect(parseReaisToCents("1.005,99")).toBe(100599);
  });
});
