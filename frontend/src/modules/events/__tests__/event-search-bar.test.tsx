import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventSearchBar } from "../components/event-search-bar";
import { eventSearchService } from "../services/event-search.service";
import {
  EMPTY_FILTERS,
  type EventSearchFilters,
} from "../types/event-search.dto";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
}));
jest.mock("../services/event-search.service", () => ({
  eventSearchService: { suggest: jest.fn() },
}));
const suggest = jest.mocked(eventSearchService.suggest);

const suggestions = [
  {
    id: 7,
    name: "Rock in Rio",
    location: "Rio de Janeiro",
    starts_at: "2099-09-10T20:00:00.000Z",
  },
  {
    id: 8,
    name: "Rock Nacional",
    location: "Recife",
    starts_at: "2099-10-01T20:00:00.000Z",
  },
];

// opções do autocomplete (o <select> de local também tem options)
const suggestionOptions = async () =>
  within(await screen.findByRole("listbox")).findAllByRole("option");

function renderBar(
  props: Partial<React.ComponentProps<typeof EventSearchBar>> = {},
) {
  const onSearch = jest.fn();
  const onClear = jest.fn();
  // a barra é controlada: o teste segura o estado como a EventsHome faz
  function Harness() {
    const [filters, setFilters] = useState<EventSearchFilters>(EMPTY_FILTERS);
    return (
      <EventSearchBar
        filters={filters}
        onFiltersChange={setFilters}
        locations={[
          { value: "Recife", count: 2 },
          { value: "São Paulo", count: 5 },
        ]}
        active={false}
        searching={false}
        onSearch={onSearch}
        onClear={onClear}
        {...props}
      />
    );
  }
  render(<Harness />);
  return { onSearch, onClear };
}

describe("<EventSearchBar />", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    suggest.mockResolvedValue(suggestions);
  });

  describe("autocomplete", () => {
    it("mostra sugestões depois de digitar e abre o evento escolhido", async () => {
      renderBar();
      await userEvent.type(
        screen.getByRole("combobox", { name: "Buscar eventos" }),
        "rock",
      );

      const options = await suggestionOptions();
      expect(options).toHaveLength(2);
      expect(
        screen.getByRole("combobox", { name: "Buscar eventos" }),
      ).toHaveAttribute("aria-expanded", "true");
      expect(suggest).toHaveBeenLastCalledWith("rock", expect.any(AbortSignal));

      await userEvent.click(screen.getByText("Rock Nacional"));
      expect(push).toHaveBeenCalledWith("/events/8");
    });

    it("navega pelas sugestões com o teclado", async () => {
      renderBar();
      const input = screen.getByRole("combobox", { name: "Buscar eventos" });
      await userEvent.type(input, "rock");
      await suggestionOptions();

      await userEvent.keyboard("{ArrowDown}{ArrowDown}");
      expect(
        within(screen.getByRole("listbox")).getAllByRole("option")[1],
      ).toHaveAttribute("aria-selected", "true");
      expect(input).toHaveAttribute(
        "aria-activedescendant",
        within(screen.getByRole("listbox")).getAllByRole("option")[1].id,
      );

      await userEvent.keyboard("{Enter}");
      expect(push).toHaveBeenCalledWith("/events/8");
    });

    it("Escape fecha a lista", async () => {
      renderBar();
      await userEvent.type(
        screen.getByRole("combobox", { name: "Buscar eventos" }),
        "rock",
      );
      await suggestionOptions();

      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("Enter sem sugestão destacada faz a busca completa", async () => {
      const { onSearch } = renderBar();
      await userEvent.type(
        screen.getByRole("combobox", { name: "Buscar eventos" }),
        "rock{Enter}",
      );

      expect(onSearch).toHaveBeenCalledWith({ ...EMPTY_FILTERS, q: "rock" });
      expect(push).not.toHaveBeenCalled();
    });
  });

  describe("filtros", () => {
    it("envia local, período e disponibilidade", async () => {
      const { onSearch } = renderBar();

      await userEvent.selectOptions(
        screen.getByLabelText("Local"),
        "São Paulo",
      );
      await userEvent.type(screen.getByLabelText("De"), "2099-05-10");
      await userEvent.type(screen.getByLabelText("Até"), "2099-05-20");
      await userEvent.click(
        screen.getByRole("checkbox", { name: "Só com ingressos disponíveis" }),
      );
      await userEvent.click(screen.getByRole("button", { name: "Buscar" }));

      expect(onSearch).toHaveBeenCalledWith({
        q: "",
        location: "São Paulo",
        from: "2099-05-10",
        to: "2099-05-20",
        onlyAvailable: true,
      });
    });

    it("lista os locais da faceta com a contagem", () => {
      renderBar();
      expect(
        screen.getByRole("option", { name: "São Paulo (5)" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Todos os locais" }),
      ).toBeInTheDocument();
    });

    it("sem facetas (busca fora do ar) o filtro de local fica desabilitado", () => {
      renderBar({ locations: [] });
      expect(screen.getByLabelText("Local")).toBeDisabled();
    });

    it("bloqueia período invertido", async () => {
      const { onSearch } = renderBar();
      await userEvent.type(screen.getByLabelText("De"), "2099-05-20");
      await userEvent.type(screen.getByLabelText("Até"), "2099-05-10");

      expect(screen.getByRole("alert")).toHaveTextContent(
        "A data inicial precisa ser anterior ou igual à final.",
      );
      expect(screen.getByRole("button", { name: "Buscar" })).toBeDisabled();
      expect(onSearch).not.toHaveBeenCalled();
    });

    it("Limpar busca aparece com filtro preenchido ou busca ativa", async () => {
      const { onClear } = renderBar();
      expect(
        screen.queryByRole("button", { name: "Limpar busca" }),
      ).not.toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("checkbox", { name: "Só com ingressos disponíveis" }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Limpar busca" }),
      );
      expect(onClear).toHaveBeenCalled();
    });
  });
});
