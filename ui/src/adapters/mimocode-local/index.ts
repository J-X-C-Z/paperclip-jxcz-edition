import type { UIAdapterModule } from "../types";
import { parseAcpxStdoutLine } from "@paperclipai/adapter-utils/acpx-engine/ui";
import { SchemaConfigFields, buildSchemaAdapterConfig } from "../schema-config-fields";

export const mimocodeLocalUIAdapter: UIAdapterModule = {
  type: "mimocode_local",
  label: "MiMo Code",
  parseStdoutLine: parseAcpxStdoutLine,
  ConfigFields: SchemaConfigFields,
  buildAdapterConfig: buildSchemaAdapterConfig,
};
