import { act, renderHook, waitFor } from "@testing-library/react";
import { makeSearchItem, makeSearchResponse, nestError } from "@test/helpers";
import { useEventSearch } from "../hooks/useEventSearch";
import { eventSearchService } from "../services/event-search.service";
import { EMPTY_FILTERS, SEARCH_PAGE_SIZE } from "../types/event-search.dto";

jest.mock("../services/event-search.service", () => ({
  eventSearchService: { search: jest.fn() },
}));
const search = jest.mocked(eventSearchService.search);

const facets = { locations: [{ value: "Recife", count: 3 }] };

describe("useEventSearch", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    search.mockResolvedValue(makeSearchResponse({ items: [], facets }));
  });

  it("começa inativa e carrega as opções de local", async () => {
    const { result } = renderHook(() => useEventSearch());

    expect(result.current.active).toBe(false);
    expect(result.current.loading).toBe(false);
    await waitFor(() =>
      expect(result.current.locations).toEqual(facets.locations),
    );
    expect(search).toHaveBeenCalledWith(
      { page: 1, size: 1 },
      expect.any(AbortSignal),
    );
  });

  it("sem as opções de local (busca fora) segue funcionando", async () => {
    search.mockRejectedValueOnce(nestError(503, "fora"));
    const { result } = renderHook(() => useEventSearch());

    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    expect(result.current.locations).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("busca com os filtros e expõe o resultado", async () => {
    const { result } = renderHook(() => useEventSearch());
    await waitFor(() => expect(result.current.locations).toHaveLength(1));
    const response = makeSearchResponse({ items: [makeSearchItem({ id: 9 })] });
    search.mockResolvedValueOnce(response);

    act(() => result.current.search({ ...EMPTY_FILTERS, q: "rock" }));

    expect(result.current.active).toBe(true);
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.result).toEqual(response));
    expect(result.current.loading).toBe(false);
    expect(search).toHaveBeenLastCalledWith(
      { q: "rock", page: 1, size: SEARCH_PAGE_SIZE },
      expect.any(AbortSignal),
    );
  });

  it("formulário vazio não ativa a busca", () => {
    const { result } = renderHook(() => useEventSearch());
    act(() => result.current.search(EMPTY_FILTERS));
    expect(result.current.active).toBe(false);
  });

  it("expõe a mensagem do 503 e permite tentar de novo", async () => {
    const { result } = renderHook(() => useEventSearch());
    await waitFor(() => expect(result.current.locations).toHaveLength(1));
    search.mockRejectedValueOnce(
      nestError(503, "A busca está temporariamente indisponível."),
    );

    act(() => result.current.search({ ...EMPTY_FILTERS, q: "rock" }));
    await waitFor(() =>
      expect(result.current.error).toBe(
        "A busca está temporariamente indisponível.",
      ),
    );

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.result).not.toBeNull());
    expect(result.current.error).toBeNull();
  });

  it("goToPage refaz a busca na página pedida e clear volta ao estado inicial", async () => {
    const { result } = renderHook(() => useEventSearch());
    act(() => result.current.search({ ...EMPTY_FILTERS, onlyAvailable: true }));
    await waitFor(() => expect(result.current.result).not.toBeNull());

    act(() => result.current.goToPage(2));
    expect(result.current.page).toBe(2);
    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith(
        { available: true, page: 2, size: SEARCH_PAGE_SIZE },
        expect.any(AbortSignal),
      ),
    );

    act(() => result.current.clear());
    expect(result.current.active).toBe(false);
    expect(result.current.result).toBeNull();
  });
});
