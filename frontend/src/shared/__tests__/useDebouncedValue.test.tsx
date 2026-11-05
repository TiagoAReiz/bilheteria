import { act, renderHook } from "@testing-library/react";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";

describe("useDebouncedValue", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("só atualiza depois do intervalo sem mudanças", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 200),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "ab" });
    act(() => jest.advanceTimersByTime(150));
    rerender({ value: "abc" });
    act(() => jest.advanceTimersByTime(150));
    expect(result.current).toBe("a");

    act(() => jest.advanceTimersByTime(50));
    expect(result.current).toBe("abc");
  });
});
