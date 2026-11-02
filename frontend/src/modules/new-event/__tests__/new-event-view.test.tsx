import { render, screen } from "@testing-library/react";
import { makeUser, sessionValue } from "@test/helpers";
import { useSession } from "@/shared/hooks/useSession";
import { NewEventView } from "../components/new-event-view";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/shared/hooks/useSession", () => ({ useSession: jest.fn() }));
jest.mock("../services/new-event.service", () => ({ newEventService: { create: jest.fn() } }));
const mockedUseSession = jest.mocked(useSession);

describe("<NewEventView />", () => {
  it("USER vê a explicação e o link para o perfil", () => {
    mockedUseSession.mockReturnValue(sessionValue(makeUser({ role: "USER" })));
    render(<NewEventView />);
    expect(screen.getByText("Apenas organizadores podem criar eventos")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir para o perfil" })).toHaveAttribute("href", "/profile");
    expect(screen.queryByLabelText("Nome")).not.toBeInTheDocument();
  });

  it.each(["ORGANIZER", "ADMIN"] as const)("%s vê o formulário", (role) => {
    mockedUseSession.mockReturnValue(sessionValue(makeUser({ role })));
    render(<NewEventView />);
    expect(screen.getByLabelText("Nome")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar evento" })).toBeInTheDocument();
  });
});
