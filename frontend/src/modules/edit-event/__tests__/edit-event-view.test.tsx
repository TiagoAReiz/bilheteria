import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { makeEvent, makeUser, nestError, sessionValue } from "@test/helpers";
import { useSession } from "@/shared/hooks/useSession";
import { EditEventView } from "../components/edit-event-view";
import { editEventService } from "../services/edit-event.service";

const push = jest.fn();
let routeId = "1";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
  useParams: () => ({ id: routeId }),
}));
jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock("@/shared/hooks/useSession", () => ({ useSession: jest.fn() }));
jest.mock("../services/edit-event.service", () => ({
  editEventService: { getEvent: jest.fn(), update: jest.fn() },
}));

const svc = jest.mocked(editEventService);
const owner = makeUser({ id: "org-1", role: "ORGANIZER" });

describe("<EditEventView />", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    routeId = "1";
    jest.mocked(useSession).mockReturnValue(sessionValue(owner));
  });

  it("preenche o formulário com os valores atuais", async () => {
    svc.getEvent.mockResolvedValue(
      makeEvent({
        name: "Show",
        location: "Arena",
        capacity: 50,
        price_cents: 8990,
        max_tickets_per_cpf: 3,
      }),
    );
    render(<EditEventView />);

    expect(await screen.findByLabelText("Nome")).toHaveValue("Show");
    expect(screen.getByLabelText("Local")).toHaveValue("Arena");
    expect(screen.getByLabelText("Capacidade")).toHaveValue(50);
    expect(screen.getByLabelText("Preço do ingresso (R$)")).toHaveValue(
      "89,90",
    );
    expect(screen.getByLabelText("Ingressos por CPF")).toHaveValue(3);
    expect(screen.getByText(/Só pode aumentar \(até 10\)/)).toBeInTheDocument();
  });

  it("salva com PATCH e volta para o evento", async () => {
    svc.getEvent.mockResolvedValue(
      makeEvent({ id: 1, max_tickets_per_cpf: 2 }),
    );
    svc.update.mockResolvedValue(makeEvent({ id: 1, max_tickets_per_cpf: 4 }));
    render(<EditEventView />);

    const limit = await screen.findByLabelText("Ingressos por CPF");
    await userEvent.clear(limit);
    await userEvent.type(limit, "4");
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar alterações" }),
    );

    expect(svc.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        max_tickets_per_cpf: 4,
        price_cents: 5000,
        capacity: 100,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Evento atualizado!");
    expect(push).toHaveBeenCalledWith("/events/1");
  });

  it("não deixa diminuir o limite por CPF nem a capacidade", async () => {
    svc.getEvent.mockResolvedValue(
      makeEvent({ capacity: 100, max_tickets_per_cpf: 3 }),
    );
    render(<EditEventView />);

    const limit = await screen.findByLabelText("Ingressos por CPF");
    await userEvent.clear(limit);
    await userEvent.type(limit, "2");
    const capacity = screen.getByLabelText("Capacidade");
    await userEvent.clear(capacity);
    await userEvent.type(capacity, "99");
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar alterações" }),
    );

    expect(
      await screen.findByText("O limite por CPF não pode diminuir (mínimo 3)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("A capacidade não pode diminuir (mínimo 100)"),
    ).toBeInTheDocument();
    expect(svc.update).not.toHaveBeenCalled();
  });

  it("mostra a mensagem da API quando ela recusa", async () => {
    svc.getEvent.mockResolvedValue(makeEvent());
    svc.update.mockRejectedValue(
      nestError(
        409,
        "O evento já começou e não pode mais ser editado",
        "Conflict",
      ),
    );
    render(<EditEventView />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Salvar alterações" }),
    );
    expect(toast.error).toHaveBeenCalledWith(
      "O evento já começou e não pode mais ser editado",
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("outro organizador não vê o formulário", async () => {
    jest
      .mocked(useSession)
      .mockReturnValue(
        sessionValue(makeUser({ id: "org-2", role: "ORGANIZER" })),
      );
    svc.getEvent.mockResolvedValue(makeEvent());
    render(<EditEventView />);

    expect(
      await screen.findByText("Você não pode editar este evento"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Salvar alterações" }),
    ).not.toBeInTheDocument();
  });

  it("ADMIN edita evento de outro organizador", async () => {
    jest
      .mocked(useSession)
      .mockReturnValue(sessionValue(makeUser({ id: "adm", role: "ADMIN" })));
    svc.getEvent.mockResolvedValue(makeEvent());
    render(<EditEventView />);

    expect(
      await screen.findByRole("button", { name: "Salvar alterações" }),
    ).toBeInTheDocument();
  });

  it("evento que já começou não pode ser editado", async () => {
    svc.getEvent.mockResolvedValue(
      makeEvent({ starts_at: "2000-01-01T00:00:00.000Z" }),
    );
    render(<EditEventView />);

    expect(
      await screen.findByText("Este evento já começou"),
    ).toBeInTheDocument();
  });

  it("404 mostra evento não encontrado", async () => {
    svc.getEvent.mockRejectedValue(
      nestError(404, "O evento 1 não foi encontrado", "Not Found"),
    );
    render(<EditEventView />);

    expect(
      await screen.findByText("Evento não encontrado"),
    ).toBeInTheDocument();
  });

  it("id inválido na URL", () => {
    routeId = "abc";
    render(<EditEventView />);
    expect(screen.getByText("Evento inválido")).toBeInTheDocument();
    expect(svc.getEvent).not.toHaveBeenCalled();
  });
});
