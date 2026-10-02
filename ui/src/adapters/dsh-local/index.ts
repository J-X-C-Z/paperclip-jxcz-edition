import type { UIAdapterModule } from "../types";
import { parseAcpxStdoutLine } from "@paperclipai/adapter-utils/acpx-engine/ui";
import { SchemaConfigFields, buildSchemaAdapterConfig } from "../schema-config-fields";

export const dshLocalUIAdapter: UIAdapterModule = {
  type: "dsh_local",
  label: "DeepSeek Harness",
  parseStdoutLine: parseAcpxStdoutLine,
  ConfigFields: SchemaConfigFields,
  buildAdapterConfig: buildSchemaAdapterConfig,
};
