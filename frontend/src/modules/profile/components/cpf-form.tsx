"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { LockIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  isValidCpf,
  maskCpf,
  maskCpfForDisplay,
  onlyDigits,
} from "@/shared/lib/cpf";
import { useRegisterCpf } from "../hooks/useRegisterCpf";

export const CPF_RULES_TEXT =
  "O CPF é obrigatório para reservar ingressos, e cada evento define quantos ingressos um mesmo CPF pode ter.";

interface CpfRegistrationFormProps {
  /** Para onde voltar depois de cadastrar (ex.: o evento que pediu o CPF). */
  returnTo?: string | null;
  /** A conta já tem CPF (vem de GET /users/me): mostra só o CPF mascarado, sem formulário. */
  registered?: boolean;
  /** CPF mascarado vindo da API (***.456.789-**); null em contas antigas, cadastradas antes da máscara. */
  maskedCpf?: string | null;
  /** Chamado quando a conta passa a ter CPF (cadastrado agora ou já estava). */
  onRegistered?: () => void;
}

/** Campo de CPF + envio, sem moldura: usado no cartão do perfil e no modal da reserva. */
export function CpfRegistrationForm({
  returnTo,
  registered = false,
  maskedCpf = null,
  onRegistered,
}: CpfRegistrationFormProps) {
  const [cpf, setCpf] = useState("");
  const [touched, setTouched] = useState(false);
  /** Máscara do CPF cadastrado agora (o da API só chega no próximo GET /users/me). */
  const [justRegisteredMask, setJustRegisteredMask] = useState<string | null>(
    null,
  );
  const { register, loading, error, locked: justLocked } = useRegisterCpf();

  const complete = onlyDigits(cpf).length === 11;
  const valid = isValidCpf(cpf);
  const showInvalid = touched && complete && !valid;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    const outcome = await register(cpf);
    if (outcome === "registered") {
      setJustRegisteredMask(maskCpfForDisplay(cpf));
      toast.success("CPF cadastrado com sucesso!");
    } else if (outcome === "already_registered")
      toast.info("Seu CPF já estava cadastrado.");
    else toast.error("Não foi possível cadastrar o CPF.");
    if (outcome !== "error") onRegistered?.();
  }

  if (registered || justLocked) {
    return (
      <RegisteredCpf
        masked={justRegisteredMask ?? maskedCpf}
        message={justLocked && !justRegisteredMask ? error : null}
        returnTo={returnTo}
      />
    );
  }

  return (
    <div className="space-y-4">
      {returnTo ? (
        <Alert>
          <AlertTitle>Cadastre seu CPF para continuar</AlertTitle>
          <AlertDescription>
            Depois do cadastro você pode voltar e concluir a reserva.
          </AlertDescription>
        </Alert>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        <div className="space-y-2">
          <Label htmlFor="cpf-input">CPF</Label>
          <Input
            id="cpf-input"
            name="cpf"
            inputMode="numeric"
            autoComplete="off"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(e) => setCpf(maskCpf(e.target.value))}
            onBlur={() => setTouched(true)}
            disabled={loading}
            aria-invalid={showInvalid || undefined}
            aria-describedby="cpf-help"
          />
          <p
            id="cpf-help"
            className={
              showInvalid
                ? "text-sm text-destructive"
                : "text-sm text-muted-foreground"
            }
          >
            {showInvalid
              ? "CPF inválido. Confira os números digitados."
              : "Digite apenas os números; a máscara é automática."}
          </p>
        </div>
        <Button type="submit" disabled={loading || !valid}>
          {loading ? (
            <Loader2Icon className="animate-spin" aria-hidden />
          ) : null}
          {loading ? "Cadastrando..." : "Cadastrar CPF"}
        </Button>
      </form>

      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Erro ao cadastrar CPF</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

/** CPF já cadastrado: só leitura, mascarado, sem campo nem botão. */
function RegisteredCpf({
  masked,
  message,
  returnTo,
}: {
  masked: string | null;
  message: string | null;
  returnTo?: string | null;
}) {
  return (
    <div role="status" className="space-y-2">
      <div className="flex items-center gap-2">
        <LockIcon className="size-4 text-muted-foreground" aria-hidden />
        <span className="text-sm text-muted-foreground">CPF cadastrado</span>
        {masked ? (
          <span className="font-mono text-base font-medium tracking-wide">
            {masked}
          </span>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">
        {message ?? "Vinculado a esta conta e não pode ser alterado."}
      </p>
      {returnTo ? (
        <Link
          href={returnTo}
          className="text-sm font-medium underline underline-offset-4"
        >
          Voltar e reservar ingresso
        </Link>
      ) : null}
    </div>
  );
}

type CpfFormProps = Omit<CpfRegistrationFormProps, "onRegistered">;

/** Cartão de CPF da página de perfil. */
export function CpfForm(props: CpfFormProps) {
  return (
    <Card id="cpf">
      <CardHeader>
        <CardTitle>CPF</CardTitle>
        {props.registered ? null : (
          <CardDescription>
            {CPF_RULES_TEXT} Ele é cadastrado uma única vez e{" "}
            <strong>não pode ser alterado depois</strong>.
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <CpfRegistrationForm {...props} />
      </CardContent>
    </Card>
  );
}
