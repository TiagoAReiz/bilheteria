import { render, screen } from "@testing-library/react";
import {
  makeEventDetail,
  makeUser,
  nestError,
  sessionValue,
} from "@test/helpers";
import { useSession } from "@/shared/hooks/useSession";
import { EventDetail } from "../components/event-detail";
import { eventDetailService } from "../services/event-detail.service";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock("@/shared/hooks/useSession", () => ({ useSession: jest.fn() }));
jest.mock("../services/event-detail.service", () => ({
  eventDetailService: {
    getEvent: jest.fn(),
    getTicketStatus: jest.fn(),
    reserveTicket: jest.fn(),
  },
}));

const svc = jest.mocked(eventDetailService);

describe("<EventDetail />", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(useSession).mockReturnValue(sessionValue(null));
  });

  it("mostra o evento e o status dos ingressos", async () => {
    svc.getEvent.mockResolvedValue(
      makeEventDetail({
        id: 2,
        name: "Stand-up",
        location: "Teatro Municipal",
      }),
    );
    svc.getTicketStatus.mockResolvedValue({
      total: 100,
      available: 60,
      reserved: 40,
    });
    render(<EventDetail eventId={2} />);

    expect(await screen.findByText("Stand-up")).toBeInTheDocument();
    expect(screen.getByText("Teatro Municipal")).toBeInTheDocument();
    expect(await screen.findByText("60")).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.getByText("Disponíveis")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /reservar ingresso/i }),
    ).toBeEnabled();
  });

  it("mostra o preço do ingresso em reais", async () => {
    svc.getEvent.mockResolvedValue(makeEventDetail({ price_cents: 8990 }));
    svc.getTicketStatus.mockResolvedValue({
      total: 10,
      available: 5,
      reserved: 5,
    });
    render(<EventDetail eventId={1} />);

    expect(await screen.findByText(/R\$\s89,90/)).toBeInTheDocument();
  });

  it("evento sem preço (anterior ao pagamento): vendas indisponíveis e reserva desabilitada", async () => {
    svc.getEvent.mockResolvedValue(makeEventDetail({ price_cents: null }));
    svc.getTicketStatus.mockResolvedValue({
      total: 10,
      available: 5,
      reserved: 5,
    });
    render(<EventDetail eventId={1} />);

    expect(await screen.findByText("Preço a definir")).toBeInTheDocument();
    expect(screen.getByText("Vendas indisponíveis")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /reservar ingresso/i }),
    ).toBeDisabled();
  });

  it("marca como esgotado e desabilita a reserva", async () => {
    svc.getEvent.mockResolvedValue(makeEventDetail());
    svc.getTicketStatus.mockResolvedValue({
      total: 10,
      available: 0,
      reserved: 10,
    });
    render(<EventDetail eventId={1} />);

    expect(await screen.findByText("Esgotado")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /reservar ingresso/i }),
    ).toBeDisabled();
  });

  it("mostra 'Evento não encontrado' no 404", async () => {
    svc.getEvent.mockRejectedValue(
      nestError(404, "O evento 99 não foi encontrado"),
    );
    svc.getTicketStatus.mockRejectedValue(
      nestError(404, "O evento 99 não foi encontrado"),
    );
    render(<EventDetail eventId={99} />);

    expect(
      await screen.findByText("Evento não encontrado"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("O evento 99 não foi encontrado"),
    ).toBeInTheDocument();
  });

  describe("imagens", () => {
    const withImages = () =>
      makeEventDetail({
        organizer_id: "org-1",
        cover_url: "http://cdn/capa.png",
        photos: [
          { id: 1, url: "http://cdn/p1.png", position: 0 },
          { id: 2, url: "http://cdn/p2.png", position: 1 },
        ],
      });

    beforeEach(() => {
      svc.getTicketStatus.mockResolvedValue({
        total: 10,
        available: 5,
        reserved: 5,
      });
    });

    it("mostra a capa no topo e a galeria em ordem para qualquer visitante", async () => {
      svc.getEvent.mockResolvedValue(withImages());
      render(<EventDetail eventId={1} />);

      expect(
        await screen.findByRole("img", { name: /capa de/i }),
      ).toHaveAttribute("src", "http://cdn/capa.png");
      const gallery = screen.getByRole("list", { name: "Galeria de fotos" });
      expect(gallery.querySelectorAll("img")[0]).toHaveAttribute(
        "src",
        "http://cdn/p1.png",
      );
      expect(gallery.querySelectorAll("img")[1]).toHaveAttribute(
        "src",
        "http://cdn/p2.png",
      );
      // sem controles de edição
      expect(
        screen.queryByRole("button", { name: /trocar capa/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /remover foto/i }),
      ).not.toBeInTheDocument();
    });

    it("outro organizador não vê os controles", async () => {
      jest
        .mocked(useSession)
        .mockReturnValue(
          sessionValue(makeUser({ id: "org-2", role: "ORGANIZER" })),
        );
      svc.getEvent.mockResolvedValue(withImages());
      render(<EventDetail eventId={1} />);

      await screen.findByText("Show de Rock");
      expect(
        screen.queryByRole("button", { name: /trocar capa/i }),
      ).not.toBeInTheDocument();
    });

    it("o organizador dono vê capa, galeria (x/10) e controles de cada foto", async () => {
      jest
        .mocked(useSession)
        .mockReturnValue(
          sessionValue(makeUser({ id: "org-1", role: "ORGANIZER" })),
        );
      svc.getEvent.mockResolvedValue(withImages());
      render(<EventDetail eventId={1} />);

      expect(
        await screen.findByRole("button", { name: /trocar capa/i }),
      ).toBeEnabled();
      expect(
        screen.getByRole("button", { name: /remover capa/i }),
      ).toBeEnabled();
      expect(
        screen.getByRole("button", { name: /adicionar foto \(2\/10\)/i }),
      ).toBeEnabled();
      expect(
        screen.getByRole("button", { name: "Mover foto 1 para a esquerda" }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "Mover foto 1 para a direita" }),
      ).toBeEnabled();
      expect(
        screen.getByRole("button", { name: "Remover foto 2" }),
      ).toBeEnabled();
      expect(screen.getByLabelText("Escolher imagem da capa")).toHaveAttribute(
        "accept",
        "image/jpeg,image/png,image/webp",
      );
    });

    it("ADMIN vê os controles de qualquer evento; galeria cheia desabilita adicionar", async () => {
      jest
        .mocked(useSession)
        .mockReturnValue(sessionValue(makeUser({ id: "adm", role: "ADMIN" })));
      svc.getEvent.mockResolvedValue(
        makeEventDetail({
          cover_url: null,
          photos: Array.from({ length: 10 }, (_, i) => ({
            id: i + 1,
            url: `http://cdn/p${i}.png`,
            position: i,
          })),
        }),
      );
      render(<EventDetail eventId={1} />);

      expect(
        await screen.findByRole("button", { name: /adicionar capa/i }),
      ).toBeEnabled();
      expect(
        screen.getByRole("button", { name: /adicionar foto \(10\/10\)/i }),
      ).toBeDisabled();
      expect(screen.getByText(/a galeria está cheia/i)).toBeInTheDocument();
    });
  });

  describe("editar evento", () => {
    beforeEach(() => {
      svc.getTicketStatus.mockResolvedValue({
        total: 10,
        available: 5,
        reserved: 5,
      });
    });

    it("o organizador dono vê o link para editar", async () => {
      jest
        .mocked(useSession)
        .mockReturnValue(
          sessionValue(makeUser({ id: "org-1", role: "ORGANIZER" })),
        );
      svc.getEvent.mockResolvedValue(makeEventDetail({ id: 5 }));
      render(<EventDetail eventId={5} />);

      expect(
        await screen.findByRole("link", { name: /editar evento/i }),
      ).toHaveAttribute("href", "/events/5/edit");
    });

    it("visitante e outro organizador não veem", async () => {
      jest
        .mocked(useSession)
        .mockReturnValue(
          sessionValue(makeUser({ id: "org-2", role: "ORGANIZER" })),
        );
      svc.getEvent.mockResolvedValue(makeEventDetail());
      render(<EventDetail eventId={1} />);

      await screen.findByText("Show de Rock");
      expect(
        screen.queryByRole("link", { name: /editar evento/i }),
      ).not.toBeInTheDocument();
    });

    it("evento que já começou não oferece editar", async () => {
      jest
        .mocked(useSession)
        .mockReturnValue(
          sessionValue(makeUser({ id: "org-1", role: "ORGANIZER" })),
        );
      svc.getEvent.mockResolvedValue(
        makeEventDetail({ starts_at: "2000-01-01T00:00:00.000Z" }),
      );
      render(<EventDetail eventId={1} />);

      await screen.findByText("Show de Rock");
      expect(
        screen.queryByRole("link", { name: /editar evento/i }),
      ).not.toBeInTheDocument();
    });
  });
});
