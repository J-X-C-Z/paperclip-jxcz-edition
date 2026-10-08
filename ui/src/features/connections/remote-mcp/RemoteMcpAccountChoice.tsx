import { Button } from "@/components/ui/button";
import { InlineBanner } from "@/components/InlineBanner";
import { ConnectionChoiceList } from "../ConnectionChoiceList";
import { uiText } from "@/i18n";

/** Shared presentation for account reuse, including the requested external app. */
export function RemoteMcpAccountChoice({
  providerName,
  upstreamServiceName,
  connections,
  pendingId,
  error,
  onSelect,
  onCancel,
  onConnectNew,
}: {
  providerName: string;
  upstreamServiceName?: string;
  connections: { id: string; name: string }[];
  pendingId?: string | null;
  error?: string | null;
  onSelect: (id: string) => void;
  onCancel?: () => void;
  onConnectNew: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">
          {upstreamServiceName
            ? uiText("Connect {service} through {provider}", { service: upstreamServiceName, provider: providerName })
            : uiText("Connect {provider}", { provider: providerName })}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {uiText("Use an existing connection or connect a new account. Existing access stays unchanged.")}
        </p>
      </div>
      {upstreamServiceName && (
        <InlineBanner compact>
          {uiText("{provider} is an external service that handles the connection and requests to {service}. Reusing this account does not yet verify app access; the agent will check it and guide any additional authorization.", { provider: providerName, service: upstreamServiceName })}
        </InlineBanner>
      )}
      <ConnectionChoiceList
        choices={connections.map((connection) => ({
          ...connection,
          description: uiText("Provider account available"),
        }))}
        pendingId={pendingId}
        onSelect={onSelect}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          disabled={Boolean(pendingId)}
          onClick={onCancel}
        >
          {uiText("Cancel")}
        </Button>
        <Button disabled={Boolean(pendingId)} onClick={onConnectNew}>
          {uiText("Connect new")}
        </Button>
      </div>
    </div>
  );
}
