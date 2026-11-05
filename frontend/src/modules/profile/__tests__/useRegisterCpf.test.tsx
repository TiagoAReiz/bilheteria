import { act, renderHook } from "@testing-library/react";
import { nestError } from "@test/helpers";
import { useRegisterCpf } from "../hooks/useRegisterCpf";
import { profileService } from "../services/profile.service";

jest.mock("../services/profile.service", () => ({
  profileService: { registerCpf: jest.fn() },
}));
const registerCpf = jest.mocked(profileService.registerCpf);

async function run(cpf = "529.982.247-25") {
  const hook = renderHook(() => useRegisterCpf());
  let outcome: unknown;
  await act(async () => {
    outcome = await hook.result.current.register(cpf);
  });
  return { ...hook, outcome };
}

describe("useRegisterCpf", () => {
  beforeEach(() => jest.resetAllMocks());

  it("envia só os dígitos e trava o formulário no sucesso", async () => {
    registerCpf.mockResolvedValue();
    const { result, outcome } = await run();
    expect(registerCpf).toHaveBeenCalledWith("52998224725");
    expect(outcome).toBe("registered");
    expect(result.current.locked).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("409 'já cadastrado': trava e guarda a mensagem", async () => {
    registerCpf.mockRejectedValue(
      nestError(
        409,
        "O CPF deste usuário já foi cadastrado e não pode ser alterado",
      ),
    );
    const { result, outcome } = await run();
    expect(outcome).toBe("already_registered");
    expect(result.current.locked).toBe(true);
    expect(result.current.error).toBe(
      "O CPF deste usuário já foi cadastrado e não pode ser alterado",
    );
  });

  it("409 'CPF de outra conta': não trava (pode tentar outro)", async () => {
    registerCpf.mockRejectedValue(
      nestError(409, "Este CPF já está vinculado a outra conta"),
    );
    const { result, outcome } = await run();
    expect(outcome).toBe("error");
    expect(result.current.locked).toBe(false);
    expect(result.current.error).toBe(
      "Este CPF já está vinculado a outra conta",
    );
  });

  it("400: CPF inválido", async () => {
    registerCpf.mockRejectedValue(nestError(400, "CPF inválido"));
    const { result, outcome } = await run();
    expect(outcome).toBe("error");
    expect(result.current.error).toBe("CPF inválido");
  });
});
