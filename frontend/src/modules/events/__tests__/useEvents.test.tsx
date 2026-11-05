import { act, renderHook, waitFor } from "@testing-library/react";
import { makeEvent, nestError } from "@test/helpers";
import { useEvents } from "../hooks/useEvents";
import { eventsService } from "../services/events.service";

jest.mock("../services/events.service", () => ({
  eventsService: { listUpcoming: jest.fn() },
}));
const listUpcoming = jest.mocked(eventsService.listUpcoming);

describe("useEvents", () => {
  beforeEach(() => jest.resetAllMocks());

  it("começa carregando e depois expõe os eventos", async () => {
    const events = [makeEvent(), makeEvent({ id: 2 })];
    listUpcoming.mockResolvedValue(events);

    const { result } = renderHook(() => useEvents());
    expect(result.current.loading).toBe(true);
    expect(result.current.events).toEqual([]);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events).toEqual(events);
    expect(result.current.error).toBeNull();
  });

  it("expõe a mensagem de erro do backend", async () => {
    listUpcoming.mockRejectedValue(nestError(500, "Falha no banco"));
    const { result } = renderHook(() => useEvents());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Falha no banco");
  });

  it("reload busca novamente", async () => {
    listUpcoming
      .mockRejectedValueOnce(nestError(500, "x"))
      .mockResolvedValueOnce([makeEvent()]);
    const { result } = renderHook(() => useEvents());
    await waitFor(() => expect(result.current.error).toBe("x"));

    await act(() => result.current.reload());
    expect(result.current.error).toBeNull();
    expect(result.current.events).toHaveLength(1);
    expect(listUpcoming).toHaveBeenCalledTimes(2);
  });
});
