import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { makeEvent, nestError } from "@test/helpers";
import { NewEventForm } from "../components/new-event-form";
import { newEventService } from "../services/new-event.service";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: jest.fn() }) }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("../services/new-event.service", () => ({ newEventService: { create: jest.fn() } }));
const create = jest.mocked(newEventService.create);

async function fillValid() {
  await userEvent.type(screen.getByLabelText("Nome"), "Festival");
  await userEvent.type(screen.getByLabelText("Descrição (opcional)"), "Música ao vivo");
  await userEvent.type(screen.getByLabelText("Local"), "Parque");
  // datetime-local não aceita digitação no jsdom; define o valor diretamente
  fireEvent.input(screen.getByLabelText("Data e horário"), { target: { value: "2099-06-01T20:00" } });
  await userEvent.type(screen.getByLabelText("Capacidade"), "500");
  await userEvent.type(screen.getByLabelText("Preço do ingresso (R$)"), "89,90");
}

describe("<NewEventForm />", () => {
  beforeEach(() => jest.clearAllMocks());

  it("mostra erros de validação e não chama a API", async () => {
    render(<NewEventForm />);
    await userEvent.click(screen.getByRole("button", { name: "Criar evento" }));

    expect(await screen.findByText("Informe o nome do evento")).toBeInTheDocument();
    expect(screen.getByText("Informe o local")).toBeInTheDocument();
    expect(screen.getByText("Informe a data e o horário")).toBeInTheDocument();
    expect(screen.getByText("Informe a capacidade")).toBeInTheDocument();
    expect(screen.getByText("Informe o preço do ingresso")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("cria o evento e navega para o detalhe", async () => {
    create.mockResolvedValue(makeEvent({ id: 33 }));
    render(<NewEventForm />);
    await fillValid();
    await userEvent.click(screen.getByRole("button", { name: "Criar evento" }));

    expect(create).toHaveBeenCalledWith({
      name: "Festival",
      description: "Música ao vivo",
      location: "Parque",
      starts_at: new Date("2099-06-01T20:00").toISOString(),
      capacity: 500,
      // reais digitados viram centavos inteiros
      price_cents: 8990,
      // padrão do formulário
      max_tickets_per_cpf: 2,
    });
    expect(toast.success).toHaveBeenCalledWith("Evento criado com sucesso!");
    expect(push).toHaveBeenCalledWith("/events/33");
  });

  it("envia o limite por CPF escolhido pelo organizador", async () => {
    create.mockResolvedValue(makeEvent({ id: 34 }));
    render(<NewEventForm />);
    await fillValid();
    const limit = screen.getByLabelText("Ingressos por CPF");
    expect(limit).toHaveValue(2);
    await userEvent.clear(limit);
    await userEvent.type(limit, "4");
    await userEvent.click(screen.getByRole("button", { name: "Criar evento" }));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ max_tickets_per_cpf: 4 }));
  });

  it("limite por CPF acima de 10 mostra erro e não chama a API", async () => {
    render(<NewEventForm />);
    await fillValid();
    const limit = screen.getByLabelText("Ingressos por CPF");
    await userEvent.clear(limit);
    await userEvent.type(limit, "11");
    await userEvent.click(screen.getByRole("button", { name: "Criar evento" }));

    expect(await screen.findByText("O limite máximo é 10")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("preço inválido mostra o erro no campo e não chama a API", async () => {
    render(<NewEventForm />);
    await fillValid();
    const price = screen.getByLabelText("Preço do ingresso (R$)");
    await userEvent.clear(price);
    await userEvent.type(price, "0,50");
    await userEvent.click(screen.getByRole("button", { name: "Criar evento" }));

    expect(await screen.findByText(/O preço mínimo é R\$\s1,00/)).toBeInTheDocument();
    expect(price).toHaveAttribute("aria-invalid", "true");
    expect(create).not.toHaveBeenCalled();
  });

  it("403: avisa que só organizadores podem criar", async () => {
    create.mockRejectedValue(nestError(403, "Forbidden resource"));
    render(<NewEventForm />);
    await fillValid();
    await userEvent.click(screen.getByRole("button", { name: "Criar evento" }));

    expect(toast.error).toHaveBeenCalledWith("Apenas organizadores podem criar eventos.");
    expect(push).not.toHaveBeenCalled();
  });

  it("400: mostra as mensagens de validação do backend", async () => {
    create.mockRejectedValue(nestError(400, ["starts_at deve ser uma data futura"]));
    render(<NewEventForm />);
    await fillValid();
    await userEvent.click(screen.getByRole("button", { name: "Criar evento" }));

    expect(toast.error).toHaveBeenCalledWith("starts_at deve ser uma data futura");
  });
});
