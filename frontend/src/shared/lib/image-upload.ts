import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, type ImageContentType, type PresignedUpload } from "@/shared/types/image";

export function isAllowedImageType(type: string): type is ImageContentType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(type);
}

/**
 * Checagem antes de pedir a URL de upload (só para dar o erro na hora; quem garante é o S3 e a
 * confirmação na API). Retorna a mensagem de erro ou null se o arquivo pode ser enviado.
 */
export function validateImageFile(file: File): string | null {
  if (!isAllowedImageType(file.type)) return "Envie uma imagem JPEG, PNG ou WebP.";
  if (file.size === 0) return "O arquivo está vazio.";
  if (file.size > MAX_IMAGE_BYTES) return "A imagem deve ter no máximo 5 MB.";
  return null;
}

const S3_ERRORS: Record<string, string> = {
  EntityTooLarge: "A imagem deve ter no máximo 5 MB.",
  EntityTooSmall: "O arquivo está vazio.",
  AccessDenied: "O envio expirou ou foi recusado. Tente de novo.",
};

/**
 * Envia o arquivo direto ao bucket com o POST pré-assinado: campos primeiro, arquivo por último
 * (exigência do S3). Sem cookies: o bucket não é a nossa API.
 */
export async function uploadToPresignedPost(upload: PresignedUpload, file: File): Promise<void> {
  const form = new FormData();
  for (const [name, value] of Object.entries(upload.fields)) form.append(name, value);
  form.append("file", file);

  let response: Response;
  try {
    response = await fetch(upload.url, { method: "POST", body: form, credentials: "omit" });
  } catch {
    throw new Error("Não foi possível enviar a imagem ao armazenamento.");
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const code = /<Code>([^<]+)<\/Code>/.exec(body)?.[1];
    throw new Error((code && S3_ERRORS[code]) ?? "O armazenamento recusou a imagem.");
  }
}
