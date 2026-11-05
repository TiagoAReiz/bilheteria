import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { nestError, VALID_CPF } from "@test/helpers";
import { CpfForm } from "../components/cpf-form";
import { profileService } from "../services/profile.service";

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("../services/profile.service", () => ({
  profileService: { registerCpf: jest.fn() },
}));
const registerCpf = jest.mocked(profileService.registerCpf);

function getInput() {
  return screen.getByLabelText("CPF") as HTMLInputElement;
}
function getSubmit() {
  return screen.getByRole("button", { name: /cadastrar cpf/i });
}

describe("<CpfForm />", () => {
  beforeEach(() => jest.clearAllMocks());

  it("explica que o CPF não pode ser alterado depois", () => {
    render(<CpfForm />);
    expect(
      screen.getByText("não pode ser alterado depois"),
    ).toBeInTheDocument();
  });

  it("registered: mostra só o CPF mascarado, sem campo nem botão", () => {
    render(<CpfForm registered maskedCpf="***.982.247-**" />);
    expect(screen.getByText("CPF cadastrado")).toBeInTheDocument();
    expect(screen.getByText("***.982.247-**")).toBeInTheDocument();
    expect(screen.queryByLabelText("CPF")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /cadastrar cpf/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("não pode ser alterado depois"),
    ).not.toBeInTheDocument();
  });

  it("registered sem máscara (conta antiga): só avisa que está cadastrado", () => {
    render(<CpfForm registered maskedCpf={null} />);
    expect(screen.getByText("CPF cadastrado")).toBeInTheDocument();
    expect(screen.queryByText(/\*\*\*/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("CPF")).not.toBeInTheDocument();
  });

  it("aplica a máscara enquanto digita", async () => {
    render(<CpfForm />);
    await userEvent.type(getInput(), VALID_CPF);
    expect(getInput()).toHaveValue("529.982.247-25");
  });

  it("mantém o botão desabilitado e avisa quando o CPF é inválido", async () => {
    render(<CpfForm />);
    await userEvent.type(getInput(), "52998224724");
    await userEvent.tab();
    expect(getSubmit()).toBeDisabled();
    expect(screen.getByText(/CPF inválido/)).toBeInTheDocument();
  });

  it("cadastra, esconde o formulário e mostra o CPF mascarado", async () => {
    registerCpf.mockResolvedValue();
    render(<CpfForm />);
    await userEvent.type(getInput(), VALID_CPF);
    await userEvent.click(getSubmit());

    expect(registerCpf).toHaveBeenCalledWith(VALID_CPF);
    expect(await screen.findByText("CPF cadastrado")).toBeInTheDocument();
    expect(screen.getByText("***.982.247-**")).toBeInTheDocument();
    expect(
      screen.getByText("Vinculado a esta conta e não pode ser alterado."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("CPF")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /cadastrar cpf/i }),
    ).not.toBeInTheDocument();
    expect(toast.success).toHaveBeenCalled();
  });

  it("409 de CPF já cadastrado: mostra a mensagem do backend e trava", async () => {
    const msg = "O CPF deste usuário já foi cadastrado e não pode ser alterado";
    registerCpf.mockRejectedValue(nestError(409, msg));
    render(<CpfForm />);
    await userEvent.type(getInput(), VALID_CPF);
    await userEvent.click(getSubmit());

    expect(await screen.findByText(msg)).toBeInTheDocument();
    expect(screen.queryByLabelText("CPF")).not.toBeInTheDocument();
  });

  it("409 de CPF de outra conta: mostra erro e deixa tentar de novo", async () => {
    registerCpf.mockRejectedValue(
      nestError(409, "Este CPF já está vinculado a outra conta"),
    );
    render(<CpfForm />);
    await userEvent.type(getInput(), VALID_CPF);
    await userEvent.click(getSubmit());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Este CPF já está vinculado a outra conta",
    );
    expect(getInput()).toBeEnabled();
    expect(toast.error).toHaveBeenCalled();
  });

  it("com returnTo, oferece voltar ao evento após cadastrar", async () => {
    registerCpf.mockResolvedValue();
    render(<CpfForm returnTo="/events/4" />);
    expect(
      screen.getByText("Cadastre seu CPF para continuar"),
    ).toBeInTheDocument();

    await userEvent.type(getInput(), VALID_CPF);
    await userEvent.click(getSubmit());
    expect(
      await screen.findByRole("link", { name: "Voltar e reservar ingresso" }),
    ).toHaveAttribute("href", "/events/4");
  });
});
