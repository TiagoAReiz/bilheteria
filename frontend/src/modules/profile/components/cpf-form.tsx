"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { LockIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { isValidCpf, maskCpf, onlyDigits } from "@/shared/lib/cpf";
import { useRegisterCpf } from "../hooks/useRegisterCpf";

interface CpfFormProps {
  /** Para onde voltar depois de cadastrar (ex.: o evento que pediu o CPF). */
  returnTo?: string | null;
}

export function CpfForm({ returnTo }: CpfFormProps) {
  const [cpf, setCpf] = useState("");
  const [touched, setTouched] = useState(false);
  const { register, loading, error, locked } = useRegisterCpf();

  const complete = onlyDigits(cpf).length === 11;
  const valid = isValidCpf(cpf);
  const showInvalid = touched && complete && !valid;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    const outcome = await register(cpf);
    if (outcome === "registered") toast.success("CPF cadastrado com sucesso!");
    else if (outcome === "already_registered") toast.info("Seu CPF já estava cadastrado.");
    else toast.error("Não foi possível cadastrar o CPF.");
  }

  return (
    <Card id="cpf">
      <CardHeader>
        <CardTitle>CPF</CardTitle>
        <CardDescription>
          O CPF é obrigatório para reservar ingressos (limite de 2 por evento). Ele é cadastrado uma única vez e{" "}
          <strong>não pode ser alterado depois</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {returnTo && !locked ? (
          <Alert>
            <AlertTitle>Cadastre seu CPF para continuar</AlertTitle>
            <AlertDescription>Depois do cadastro você pode voltar e concluir a reserva.</AlertDescription>
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
              disabled={locked || loading}
              aria-invalid={showInvalid || undefined}
              aria-describedby="cpf-help"
            />
            <p id="cpf-help" className={showInvalid ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
              {showInvalid ? "CPF inválido. Confira os números digitados." : "Digite apenas os números; a máscara é automática."}
            </p>
          </div>
          <Button type="submit" disabled={locked || loading || !valid}>
            {loading ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
            {loading ? "Cadastrando..." : "Cadastrar CPF"}
          </Button>
        </form>

        {error && !locked ? (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Erro ao cadastrar CPF</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {locked ? (
          <Alert role="status">
            <LockIcon aria-hidden />
            <AlertTitle>CPF cadastrado</AlertTitle>
            <AlertDescription>
              <p>{error ?? "Seu CPF foi cadastrado e não pode ser alterado."}</p>
              {returnTo ? (
                <Link href={returnTo} className="font-medium underline underline-offset-4">
                  Voltar e reservar ingresso
                </Link>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
