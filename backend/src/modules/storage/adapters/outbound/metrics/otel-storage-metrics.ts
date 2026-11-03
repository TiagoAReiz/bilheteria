import {Inject, Injectable} from "@nestjs/common";
import type {Counter, Meter} from "@opentelemetry/api";
import {StorageMetricsPort} from "../../../application/ports/outbound/metrics/storage-metrics.port.js";
import {ImageKind, UploadRejection} from "../../../core/entities/image.js";
import {OTEL_METER} from "../../../../observability/adapters/outbound/otel/otel.providers.js";

// No Prometheus: bilheteria_images_upload_urls_total{kind}, bilheteria_images_uploads_confirmed_total{kind},
// bilheteria_images_uploads_rejected_total{kind,reason}, bilheteria_images_delete_failures_total{kind}
@Injectable()
export class OtelStorageMetrics implements StorageMetricsPort {
    private readonly uploadUrls: Counter;
    private readonly confirmed: Counter;
    private readonly rejected: Counter;
    private readonly deleteFailures: Counter;

    constructor(@Inject(OTEL_METER) meter: Meter) {
        this.uploadUrls = meter.createCounter('bilheteria.images.upload_urls', {
            description: 'URLs de upload (POST pré-assinado) emitidas, por tipo de imagem',
            unit: '{url}',
        });
        this.confirmed = meter.createCounter('bilheteria.images.uploads.confirmed', {
            description: 'Uploads conferidos no bucket e válidos (a gravação ainda pode ser recusada, ex.: galeria cheia)',
            unit: '{upload}',
        });
        this.rejected = meter.createCounter('bilheteria.images.uploads.rejected', {
            description: 'Confirmações de upload recusadas, por motivo',
            unit: '{upload}',
        });
        this.deleteFailures = meter.createCounter('bilheteria.images.delete_failures', {
            description: 'Imagens substituídas/removidas que não foram apagadas do bucket (órfãs)',
            unit: '{object}',
        });
    }

    uploadUrlIssued(kind: ImageKind): void {
        this.uploadUrls.add(1, {kind});
    }

    uploadConfirmed(kind: ImageKind): void {
        this.confirmed.add(1, {kind});
    }

    uploadRejected(kind: ImageKind, reason: UploadRejection): void {
        this.rejected.add(1, {kind, reason});
    }

    objectDeleteFailed(kind: ImageKind): void {
        this.deleteFailures.add(1, {kind});
    }
}
