import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { makeEvent, makeUser, nestError, sessionValue } from "@test/helpers";
import { api } from "@/shared/services/api";
import { useSession } from "@/shared/hooks/useSession";
import { favoritesService } from "../services/favorites.service";
import { FavoritesProvider } from "../hooks/useFavorites";
import { FavoriteButton } from "../components/favorite-button";
import { FavoritesView } from "../components/favorites-view";

jest.mock("@/shared/services/api", () => ({
  api: { get: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock("@/shared/hooks/useSession", () => ({ useSession: jest.fn() }));
const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/events/7",
}));
jest.mock("sonner", () => ({ toast: { error: jest.fn() } }));

const get = jest.mocked(api.get);
const put = jest.mocked(api.put);
const del = jest.mocked(api.delete);
const mockedSession = jest.mocked(useSession);

const HOUR = 60 * 60 * 1000;

function renderWithProvider(ui: React.ReactNode) {
  return render(<FavoritesProvider>{ui}</FavoritesProvider>);
}

describe("favoritesService", () => {
  beforeEach(() => jest.resetAllMocks());

  it("usa GET /favorites, PUT e DELETE /events/:id/favorite", async () => {
    get.mockResolvedValue({ data: [makeEvent()] });
    put.mockResolvedValue({ data: undefined });
    del.mockResolvedValue({ data: undefined });

    await expect(favoritesService.list()).resolves.toEqual([makeEvent()]);
    await favoritesService.add(7);
    await favoritesService.remove(7);

    expect(get).toHaveBeenCalledWith("/favorites");
    expect(put).toHaveBeenCalledWith("/events/7/favorite");
    expect(del).toHaveBeenCalledWith("/events/7/favorite");
  });
});

describe("<FavoriteButton />", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedSession.mockReturnValue(sessionValue(makeUser()));
    put.mockResolvedValue({ data: undefined });
    del.mockResolvedValue({ data: undefined });
  });

  it("sem sessão leva ao login voltando para a página atual", async () => {
    mockedSession.mockReturnValue(sessionValue(null));
    renderWithProvider(<FavoriteButton eventId={7} eventName="Show" />);

    await userEvent.click(
      screen.getByRole("button", { name: "Favoritar Show" }),
    );

    expect(push).toHaveBeenCalledWith("/login?redirect=%2Fevents%2F7");
    expect(put).not.toHaveBeenCalled();
  });

  it("marca como favorito na hora e chama a API", async () => {
    get.mockResolvedValueOnce({ data: [] }).mockResolvedValue({
      data: [makeEvent({ id: 7 })],
    });
    renderWithProvider(<FavoriteButton eventId={7} eventName="Show" />);
    await waitFor(() => expect(get).toHaveBeenCalledWith("/favorites"));

    await userEvent.click(
      screen.getByRole("button", { name: "Favoritar Show" }),
    );

    const active = await screen.findByRole("button", {
      name: "Remover Show dos favoritos",
    });
    expect(active).toHaveAttribute("aria-pressed", "true");
    expect(put).toHaveBeenCalledWith("/events/7/favorite");
  });

  it("já favoritado: desfavorita", async () => {
    get
      .mockResolvedValueOnce({ data: [makeEvent({ id: 7 })] })
      .mockResolvedValue({
        data: [],
      });
    renderWithProvider(<FavoriteButton eventId={7} eventName="Show" />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Remover Show dos favoritos" }),
    );

    expect(del).toHaveBeenCalledWith("/events/7/favorite");
    expect(
      await screen.findByRole("button", { name: "Favoritar Show" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("API recusa: desfaz e avisa", async () => {
    get.mockResolvedValue({ data: [] });
    put.mockRejectedValue(nestError(404, "O evento 7 não foi encontrado"));
    renderWithProvider(<FavoriteButton eventId={7} eventName="Show" />);
    await waitFor(() => expect(get).toHaveBeenCalled());

    await userEvent.click(
      screen.getByRole("button", { name: "Favoritar Show" }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("O evento 7 não foi encontrado"),
    );
    expect(
      screen.getByRole("button", { name: "Favoritar Show" }),
    ).toHaveAttribute("aria-pressed", "false");
  });
});

describe("<FavoritesView />", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedSession.mockReturnValue(sessionValue(makeUser()));
  });

  it("separa Em breve e À venda", async () => {
    get.mockResolvedValue({
      data: [
        makeEvent({
          id: 1,
          name: "Festival Futuro",
          sales_starts_at: new Date(Date.now() + HOUR).toISOString(),
        }),
        makeEvent({ id: 2, name: "Show Vendendo" }),
      ],
    });
    renderWithProvider(<FavoritesView />);

    expect(await screen.findByText("Festival Futuro")).toBeInTheDocument();
    const [comingSoon, onSale] = screen.getAllByRole("heading", { level: 2 });
    expect(comingSoon).toHaveTextContent("Em breve");
    expect(onSale).toHaveTextContent("À venda");
    expect(screen.getByText("Show Vendendo")).toBeInTheDocument();
  });

  it("sem favoritos mostra o convite para ver eventos", async () => {
    get.mockResolvedValue({ data: [] });
    renderWithProvider(<FavoritesView />);
    expect(
      await screen.findByText("Você ainda não favoritou nenhum evento."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver eventos" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
