import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeEvent, nestError } from "@test/helpers";
import { EventList } from "../components/event-list";
import { eventsService } from "../services/events.service";

jest.mock("../services/events.service", () => ({
  eventsService: { listUpcoming: jest.fn() },
}));
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
      makeEvent({
        id: 7,
        name: "Festival de Jazz",
        location: "Parque Ibirapuera",
        starts_at: "2099-05-10T22:00:00.000Z",
      }),
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
    expect(
      await screen.findByText("Nenhum evento programado no momento."),
    ).toBeInTheDocument();
  });

  it("mostra o erro e permite tentar novamente", async () => {
    listUpcoming
      .mockRejectedValueOnce(nestError(500, "Serviço indisponível"))
      .mockResolvedValueOnce([makeEvent()]);
    render(<EventList />);

    expect(await screen.findByText("Serviço indisponível")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Tentar novamente" }),
    );
    expect(await screen.findByText("Show de Rock")).toBeInTheDocument();
  });

  it("mostra a capa no card quando o evento tem uma", async () => {
    listUpcoming.mockResolvedValue([
      makeEvent({
        id: 1,
        name: "Com capa",
        cover_url: "http://cdn/events/1/cover/a.png",
      }),
      makeEvent({ id: 2, name: "Sem capa", cover_url: null }),
    ]);
    render(<EventList />);

    expect(
      await screen.findByRole("img", { name: "Capa de Com capa" }),
    ).toHaveAttribute("src", "http://cdn/events/1/cover/a.png");
    expect(
      screen.queryByRole("img", { name: "Capa de Sem capa" }),
    ).not.toBeInTheDocument();
  });

  describe("Em breve", () => {
    const soon = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

    it("eventos com vendas futuras vão para a seção do topo, com a data de abertura", async () => {
      listUpcoming.mockResolvedValue([
        makeEvent({ id: 1, name: "Festival Futuro", sales_starts_at: soon() }),
        makeEvent({ id: 2, name: "Show Vendendo" }),
      ]);
      render(<EventList />);

      const section = (
        await screen.findByRole("heading", { name: "Em breve" })
      ).closest("section") as HTMLElement;
      expect(within(section).getByText("Festival Futuro")).toBeInTheDocument();
      expect(within(section).getByText(/Vendas abrem em/)).toBeInTheDocument();
      expect(within(section).queryByText("Show Vendendo")).toBeNull();
      expect(screen.getByText("Show Vendendo")).toBeInTheDocument();
    });

    it("sem eventos em breve a seção não aparece", async () => {
      listUpcoming.mockResolvedValue([makeEvent()]);
      render(<EventList />);
      await screen.findByText("Show de Rock");
      expect(
        screen.queryByRole("heading", { name: "Em breve" }),
      ).not.toBeInTheDocument();
    });

    it("só eventos em breve: avisa que nada está à venda", async () => {
      listUpcoming.mockResolvedValue([makeEvent({ sales_starts_at: soon() })]);
      render(<EventList />);
      expect(
        await screen.findByText("Nenhum evento à venda no momento."),
      ).toBeInTheDocument();
    });

    it("abertura que já passou conta como à venda", async () => {
      listUpcoming.mockResolvedValue([
        makeEvent({ sales_starts_at: "2020-01-01T00:00:00.000Z" }),
      ]);
      render(<EventList />);
      await screen.findByText("Show de Rock");
      expect(
        screen.queryByRole("heading", { name: "Em breve" }),
      ).not.toBeInTheDocument();
    });
  });
});
