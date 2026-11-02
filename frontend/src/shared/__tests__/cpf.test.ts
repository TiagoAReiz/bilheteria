import { VALID_CPF } from "@test/helpers";
import { isValidCpf, maskCpf, onlyDigits } from "@/shared/lib/cpf";

describe("cpf", () => {
  it.each([
    ["5", "5"],
    ["5299", "529.9"],
    ["5299822", "529.982.2"],
    ["529982247", "529.982.247"],
    ["5299822472", "529.982.247-2"],
    ["52998224725", "529.982.247-25"],
    ["52998224725999", "529.982.247-25"],
    ["529.982.247-25", "529.982.247-25"],
  ])("maskCpf(%p) = %p", (input, expected) => {
    expect(maskCpf(input)).toBe(expected);
  });

  it("onlyDigits remove a máscara", () => {
    expect(onlyDigits("529.982.247-25")).toBe(VALID_CPF);
  });

  it("valida dígitos verificadores", () => {
    expect(isValidCpf(VALID_CPF)).toBe(true);
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224724")).toBe(false);
    expect(isValidCpf("11111111111")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
  });
});
