import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeEvent, nestError } from "@test/helpers";
import { EventList } from "../components/event-list";
import { eventsService } from "../services/events.service";

jest.mock("../services/events.service", () => ({ eventsService: { listUpcoming: jest.fn() } }));
const listUpcoming = jest.mocked(eventsService.listUpcoming);

describe("<EventList />", () => {
  beforeEach(() => jest.resetAllMocks());

  it("mostra skeleton enquanto carrega", () => {
    listUpcoming.mockReturnValue(new Promise(() => {}));
    render(<EventList />);
    expect(screen.getByTestId("events-loading")).toBeInTheDocument();
  });

  it("renderiza os cards com nome, local, data pt-BR e link", async () => {
    listUpcoming.mockResolvedValue([
      makeEvent({ id: 7, name: "Festival de Jazz", location: "Parque Ibirapuera", starts_at: "2099-05-10T22:00:00.000Z" }),
      makeEvent({ id: 8, name: "Peça de Teatro" }),
    ]);
    render(<EventList />);

    expect(await screen.findByText("Festival de Jazz")).toBeInTheDocument();
    expect(screen.getByText("Peça de Teatro")).toBeInTheDocument();
    expect(screen.getByText("Parque Ibirapuera")).toBeInTheDocument();
    // data formatada em pt-BR (ano e mês por extenso)
    expect(screen.getAllByText(/maio de 2099/i).length).toBeGreaterThan(0);
    const links = screen.getAllByRole("link", { name: "Ver detalhes" });
    expect(links[0]).toHaveAttribute("href", "/events/7");
  });

  it("mostra mensagem quando não há eventos", async () => {
    listUpcoming.mockResolvedValue([]);
    render(<EventList />);
    expect(await screen.findByText("Nenhum evento programado no momento.")).toBeInTheDocument();
  });

  it("mostra o erro e permite tentar novamente", async () => {
    listUpcoming.mockRejectedValueOnce(nestError(500, "Serviço indisponível")).mockResolvedValueOnce([makeEvent()]);
    render(<EventList />);

    expect(await screen.findByText("Serviço indisponível")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Show de Rock")).toBeInTheDocument();
  });
});
