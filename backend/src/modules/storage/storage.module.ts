import {Module} from '@nestjs/common';
import {ObservabilityModule} from "../observability/observability.module.js";
import {ImageStorageService} from "./application/services/image-storage.service.js";
import {S3ObjectStorage} from "./adapters/outbound/storage/s3-object-storage.js";
import {OtelStorageMetrics} from "./adapters/outbound/metrics/otel-storage-metrics.js";
import {IMAGE_STORAGE_SERVICE} from "./application/ports/inbound/services/image-storage.service.port.js";
import {OBJECT_STORAGE} from "./application/ports/outbound/storage/object-storage.port.js";
import {STORAGE_METRICS} from "./application/ports/outbound/metrics/storage-metrics.port.js";

// Imagens no S3 (ou compatível). Não tem controller: event e users decidem quem pode enviar
// e usam a porta inbound IMAGE_STORAGE_SERVICE para o upload pré-assinado e a confirmação.
@Module({
  providers: [
    {provide: IMAGE_STORAGE_SERVICE, useClass: ImageStorageService},
    {provide: OBJECT_STORAGE, useClass: S3ObjectStorage},
    {provide: STORAGE_METRICS, useClass: OtelStorageMetrics},
  ],
  exports: [IMAGE_STORAGE_SERVICE],
  imports: [ObservabilityModule],
})
export class StorageModule {}
