import { act, renderHook, waitFor } from "@testing-library/react";
import { nestError } from "@test/helpers";
import { useEventSuggestions } from "../hooks/useEventSuggestions";
import { eventSearchService } from "../services/event-search.service";
import { SUGGEST_DEBOUNCE_MS } from "../types/event-search.dto";

jest.mock("../services/event-search.service", () => ({
  eventSearchService: { suggest: jest.fn() },
}));
const suggest = jest.mocked(eventSearchService.suggest);

const suggestion = (id: number, name: string) => ({
  id,
  name,
  location: "Arena",
  starts_at: "2099-01-01T20:00:00.000Z",
});

describe("useEventSuggestions", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("espera a digitação parar antes de buscar", async () => {
    suggest.mockResolvedValue([suggestion(1, "Rock in Rio")]);
    const { result, rerender } = renderHook(({ q }) => useEventSuggestions(q), {
      initialProps: { q: "" },
    });

    rerender({ q: "ro" });
    rerender({ q: "roc" });
    rerender({ q: "rock" });
    act(() => jest.advanceTimersByTime(SUGGEST_DEBOUNCE_MS - 1));
    expect(suggest).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(1));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.suggestions).toHaveLength(1));
    expect(suggest).toHaveBeenCalledTimes(1);
    expect(suggest).toHaveBeenCalledWith("rock", expect.any(AbortSignal));
    expect(result.current.loading).toBe(false);
  });

  it("não busca com menos de 2 caracteres", () => {
    const { result } = renderHook(() => useEventSuggestions(" r "));
    act(() => jest.advanceTimersByTime(SUGGEST_DEBOUNCE_MS * 2));

    expect(suggest).not.toHaveBeenCalled();
    expect(result.current).toEqual({ suggestions: [], loading: false });
  });

  it("cancela a requisição anterior quando o texto muda", async () => {
    let firstSignal: AbortSignal | undefined;
    suggest.mockImplementationOnce((_q, signal) => {
      firstSignal = signal;
      return new Promise(() => {});
    });
    suggest.mockResolvedValueOnce([suggestion(2, "Rock Nacional")]);
    const { result, rerender } = renderHook(({ q }) => useEventSuggestions(q), {
      initialProps: { q: "ro" },
    });
    act(() => jest.advanceTimersByTime(SUGGEST_DEBOUNCE_MS));

    rerender({ q: "rock" });
    act(() => jest.advanceTimersByTime(SUGGEST_DEBOUNCE_MS));

    expect(firstSignal?.aborted).toBe(true);
    await waitFor(() =>
      expect(result.current.suggestions.map((s) => s.name)).toEqual([
        "Rock Nacional",
      ]),
    );
  });

  it("falha da busca só esconde as sugestões", async () => {
    suggest.mockRejectedValue(
      nestError(503, "A busca está temporariamente indisponível."),
    );
    const { result } = renderHook(() => useEventSuggestions("rock"));
    act(() => jest.advanceTimersByTime(SUGGEST_DEBOUNCE_MS));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.suggestions).toEqual([]);
  });
});
