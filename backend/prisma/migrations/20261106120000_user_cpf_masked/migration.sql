-- CPF mascarado para exibição (***.456.789-**). Contas antigas ficam com NULL: o hash não permite reconstruir.
ALTER TABLE "users" ADD COLUMN "cpf_masked" TEXT;
