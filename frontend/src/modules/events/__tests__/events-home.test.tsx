import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  makeEvent,
  makeSearchItem,
  makeSearchResponse,
  nestError,
} from "@test/helpers";
import { EventsHome } from "../components/events-home";
import { eventSearchService } from "../services/event-search.service";
import { eventsService } from "../services/events.service";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock("../services/events.service", () => ({
  eventsService: { listUpcoming: jest.fn() },
}));
jest.mock("../services/event-search.service", () => ({
  eventSearchService: { search: jest.fn(), suggest: jest.fn() },
}));
const listUpcoming = jest.mocked(eventsService.listUpcoming);
const search = jest.mocked(eventSearchService.search);

async function searchFor(text: string) {
  await userEvent.type(
    screen.getByRole("combobox", { name: "Buscar eventos" }),
    text,
  );
  await userEvent.click(screen.getByRole("button", { name: "Buscar" }));
}

describe("<EventsHome />", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(eventSearchService.suggest).mockResolvedValue([]);
    listUpcoming.mockResolvedValue([
      makeEvent({ id: 1, name: "Evento da Lista" }),
    ]);
    search.mockResolvedValue(
      makeSearchResponse({ items: [], facets: { locations: [] } }),
    );
  });

  it("sem busca mostra a lista de sempre (GET /events)", async () => {
    render(<EventsHome />);

    expect(await screen.findByText("Evento da Lista")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Próximos eventos" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("search", { name: "Buscar eventos" }),
    ).toBeInTheDocument();
  });

  it("com busca mostra os resultados, a contagem e a disponibilidade", async () => {
    render(<EventsHome />);
    search.mockResolvedValueOnce(
      makeSearchResponse({
        items: [
          makeSearchItem({
            id: 5,
            name: "Festival de Jazz",
            available_tickets: 10,
          }),
          makeSearchItem({
            id: 6,
            name: "Jazz no Parque",
            available_tickets: 0,
          }),
        ],
        total: 2,
      }),
    );

    await searchFor("jazz");

    expect(
      await screen.findByRole("heading", { name: "Resultados da busca" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 eventos encontrados")).toBeInTheDocument();
    expect(screen.queryByText("Evento da Lista")).not.toBeInTheDocument();
    const cards = screen.getAllByRole("listitem");
    expect(
      within(cards[0]).getByText("Ingressos disponíveis"),
    ).toBeInTheDocument();
    expect(within(cards[1]).getByText("Esgotado")).toBeInTheDocument();
  });

  it("pagina os resultados", async () => {
    render(<EventsHome />);
    search.mockResolvedValue(
      makeSearchResponse({ items: [makeSearchItem()], total: 30, size: 12 }),
    );

    await searchFor("rock");
    expect(await screen.findByText("Página 1 de 3")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Próxima" }));
    expect(await screen.findByText("Página 2 de 3")).toBeInTheDocument();
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: "rock", page: 2 }),
      expect.any(AbortSignal),
    );
  });

  it("busca fora do ar: mostra o 503 e volta para a lista", async () => {
    render(<EventsHome />);
    search.mockRejectedValueOnce(
      nestError(
        503,
        "A busca está temporariamente indisponível. Tente novamente em instantes.",
      ),
    );

    await searchFor("rock");

    expect(
      await screen.findByText(
        "A busca está temporariamente indisponível. Tente novamente em instantes.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Ver todos os eventos" }),
    );
    expect(await screen.findByText("Evento da Lista")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Buscar eventos" }),
    ).toHaveValue("");
  });

  it("sem resultados oferece voltar para a lista", async () => {
    render(<EventsHome />);
    await searchFor("inexistente");

    expect(
      await screen.findByText("Nenhum evento encontrado com esses filtros."),
    ).toBeInTheDocument();
  });
});
