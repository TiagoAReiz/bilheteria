import { AxiosError } from "axios";
import { nestError } from "@test/helpers";
import { getErrorMessage, getErrorStatus } from "@/shared/lib/api-error";

describe("getErrorMessage", () => {
  it("usa a message string do Nest", () => {
    expect(getErrorMessage(nestError(409, "Esgotado"))).toBe("Esgotado");
  });

  it("junta a message em array (erros de validação)", () => {
    expect(
      getErrorMessage(
        nestError(400, [
          "name should not be empty",
          "capacity must be an integer",
        ]),
      ),
    ).toBe("name should not be empty\ncapacity must be an integer");
  });

  it("usa o fallback quando não há message", () => {
    expect(getErrorMessage(nestError(500, ""), "Falhou")).toBe("Falhou");
  });

  it("informa erro de conexão quando não há response", () => {
    expect(getErrorMessage(new AxiosError("Network Error"))).toBe(
      "Não foi possível conectar ao servidor.",
    );
  });

  it("aceita Error comum e valores desconhecidos", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
    expect(getErrorMessage("x", "padrão")).toBe("padrão");
  });
});

describe("getErrorStatus", () => {
  it("retorna o status HTTP do axios", () => {
    expect(getErrorStatus(nestError(403))).toBe(403);
  });

  it("retorna undefined para erros que não são do axios", () => {
    expect(getErrorStatus(new Error("x"))).toBeUndefined();
  });
});
