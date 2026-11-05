import {
  EMPTY_FILTERS,
  hasActiveFilters,
  SEARCH_PAGE_SIZE,
  toSearchParams,
} from "../types/event-search.dto";

describe("event-search.dto", () => {
  describe("hasActiveFilters", () => {
    it("formulário vazio não é busca", () => {
      expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
      expect(hasActiveFilters({ ...EMPTY_FILTERS, q: "   " })).toBe(false);
    });

    it.each([
      { q: "rock" },
      { location: "Recife" },
      { from: "2099-01-01" },
      { to: "2099-01-31" },
      { onlyAvailable: true },
    ])("qualquer filtro conta (%j)", (patch) => {
      expect(hasActiveFilters({ ...EMPTY_FILTERS, ...patch })).toBe(true);
    });
  });

  describe("toSearchParams", () => {
    it("só envia os filtros preenchidos, com a paginação", () => {
      expect(toSearchParams({ ...EMPTY_FILTERS, q: "  jazz " }, 3)).toEqual({
        q: "jazz",
        page: 3,
        size: SEARCH_PAGE_SIZE,
      });
    });

    it("converte o período para o dia inteiro no fuso do navegador", () => {
      const params = toSearchParams({
        ...EMPTY_FILTERS,
        from: "2099-05-10",
        to: "2099-05-12",
      });

      expect(params.from).toBe(new Date(2099, 4, 10, 0, 0, 0, 0).toISOString());
      expect(params.to).toBe(
        new Date(2099, 4, 12, 23, 59, 59, 999).toISOString(),
      );
    });

    it("envia local e disponibilidade", () => {
      expect(
        toSearchParams({
          ...EMPTY_FILTERS,
          location: "São Paulo",
          onlyAvailable: true,
        }),
      ).toEqual({
        location: "São Paulo",
        available: true,
        page: 1,
        size: SEARCH_PAGE_SIZE,
      });
    });
  });
});
