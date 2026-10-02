import { uiText } from "@/i18n";
import { PhotonConnectStep } from "./PhotonConnectStep";
import { EmailEndpointSetup } from "./EmailEndpointSetup";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Eye, EyeOff, Loader2 } from "lucide-react";
import { AgentSelect } from "@/components/AgentMultiSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { agentsApi } from "@/api/agents";
import { instanceSettingsApi } from "@/api/instanceSettings";
import {
  chatEndpointsApi,
  type ChatEndpoint,
  type ChatProvider,
  type ChatEndpointSetupAction,
} from "@/api/chatEndpoints";
import { useNavigate, useSearchParams } from "@/lib/router";
import { queryKeys } from "@/lib/queryKeys";
import { copyTextToClipboard } from "@/lib/clipboard";
import { isAgentStatusInvokable } from "@paperclipai/shared";
import { sanitizedSetupErrorMessage } from "./chat-setup-error";
import {
  createGitHubPrivateKeyReadGuard,
  readGitHubPrivateKeyFile,
} from "./github-private-key-file";

const providerNames: Record<ChatProvider, string> = {
  agentmail: "AgentMail",
  slack: "Slack",
  github: "GitHub",
  discord: "Discord",
  "microsoft-teams": "Microsoft Teams",
  telegram: "Telegram",
  "imessage-photon": "iMessage Photon",
};

const knownProviders = new Set(Object.keys(providerNames));

function isProvider(value: string | null): value is ChatProvider {
  return value !== null && knownProviders.has(value);
}

function slackBotNameForAgent(agentName: string): string {
  const safeName = agentName
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return safeName || "paperclip-agent";
}

function publicOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function isChatEndpointRepairing(
  endpoint: Pick<
    ChatEndpoint,
    "provider" | "status" | "providerAccountId" | "botExternalId"
  > | null,
  resumeEndpointId: string | null,
  reconnectRequested: boolean,
): boolean {
  if (!resumeEndpointId || !endpoint) return false;
  const recoveringStatus =
    endpoint.status === "attention" || endpoint.status === "revoked";
  // A secret-only GitHub draft affected by setup trouble has no App identity
  // or reusable App credentials. It must remain first-time setup, where App ID
  // and private key are required, rather than offering a misleading reconnect.
  if (
    endpoint.provider === "github" &&
    recoveringStatus &&
    !endpoint.providerAccountId &&
    !endpoint.botExternalId
  ) {
    return false;
  }
  return (
    recoveringStatus ||
    (reconnectRequested &&
      (endpoint.status === "active" || endpoint.status === "paused"))
  );
}

function SetupRail({ step }: { step: number }) {
  return (
    <ol className="space-y-2 text-sm" aria-label={uiText("Connection setup progress")}>
      {["Choose agent", "Connect provider", "Try it"].map((label, index) => (
        <li key={label} className="flex items-center gap-2">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full border ${index < step ? "border-primary bg-primary text-primary-foreground" : index === step ? "border-foreground text-foreground" : "border-border text-muted-foreground"}`}
          >
            {index < step ? <Check className="h-3.5 w-3.5" /> : index + 1}
          </span>
          <span
            className={
              index === step
                ? "font-medium text-foreground"
                : "text-muted-foreground"
            }
          >
            {uiText(label)}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function ChatEndpointSetup() {
  const [params] = useSearchParams();
  return params.get("provider") === "agentmail" ? <EmailEndpointSetup /> : <ChatSdkEndpointSetup />;
}
function ChatSdkEndpointSetup() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const provider = isProvider(params.get("provider"))
    ? (params.get("provider") as ChatProvider)
    : null;
  const toolHref = params.get("toolHref") || "/apps";
  const preselectedAgent = params.get("agentId") ?? "";
  const resumeEndpointId = params.get("resume") ?? "";
  const reconnectRequested = params.get("reconnect") === "1";
  const [purpose, setPurpose] = useState<"choice" | "chat">(
    params.get("purpose") === "chat" ? "chat" : "choice",
  );
  const [agentId, setAgentId] = useState(preselectedAgent);
  const [endpoint, setEndpoint] = useState<ChatEndpoint | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [generatedWebhookSecret, setGeneratedWebhookSecret] = useState("");
  const [setupError, setSetupError] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: "Connectors", href: "/apps" },
      { label: uiText("Connect chat") },
    ]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs]);

  const agentsQuery = useQuery({
    queryKey: ["chat-endpoint-setup-agents", selectedCompanyId],
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });
  const resumeQuery = useQuery({
    queryKey: ["chat-endpoint-setup-resume", resumeEndpointId],
    queryFn: () => chatEndpointsApi.get(resumeEndpointId),
    enabled: Boolean(resumeEndpointId),
  });
  useEffect(() => {
    if (!resumeQuery.data) return;
    setEndpoint(resumeQuery.data);
    setAgentId(resumeQuery.data.assignedAgentId);
    setPurpose("chat");
  }, [resumeQuery.data]);
  const githubVerificationQuery = useQuery({
    queryKey: ["chat-endpoint-github-webhook-verification", endpoint?.id],
    queryFn: () => chatEndpointsApi.get(endpoint!.id),
    enabled: Boolean(
      provider === "github" &&
      endpoint?.id &&
      endpoint.setup?.step === "provider_setup" &&
      endpoint.setup?.webhookSecretConfigured &&
      !endpoint.setup.webhookVerifiedAt,
    ),
    refetchInterval: 1_500,
  });
  useEffect(() => {
    if (
      !githubVerificationQuery.data ||
      provider !== "github" ||
      !endpoint ||
      endpoint.id !== githubVerificationQuery.data.id ||
      endpoint.setup?.step !== "provider_setup" ||
      !endpoint.setup?.webhookSecretConfigured ||
      endpoint.setup.webhookVerifiedAt
    )
      return;
    setEndpoint(githubVerificationQuery.data);
  }, [endpoint, githubVerificationQuery.data, provider]);
  const experimentalSettingsQuery = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
    enabled: endpoint?.setup?.step === "test",
  });
  const activeAgents = useMemo(
    () =>
      (agentsQuery.data ?? []).filter((agent) =>
        isAgentStatusInvokable(agent.status),
      ),
    [agentsQuery.data],
  );
  const syncEndpointSnapshot = (
    next: ChatEndpoint,
    onlyIfStillVisible = false,
  ) => {
    setEndpoint((visible) =>
      onlyIfStillVisible && visible?.id !== next.id ? visible : next,
    );
    queryClient.setQueryData(["chat-endpoint-setup-resume", next.id], next);
    queryClient.setQueryData(queryKeys.chatEndpoints.detail(next.id), next);
    if (next.provider === "github") {
      queryClient.setQueryData(
        ["chat-endpoint-github-webhook-verification", next.id],
        next,
      );
    }
  };
  const createEndpoint = useMutation({
    mutationFn: () =>
      chatEndpointsApi.create(selectedCompanyId!, {
        provider: provider!,
        assignedAgentId: agentId,
      }),
    onSuccess: (next) => {
      syncEndpointSnapshot(next);
      if (next.provider === "imessage-photon") {
        const resumed = new URLSearchParams(params);
        resumed.set("resume", next.id);
        setParams(resumed, { replace: true });
      }
    },
    onError: (error) =>
      pushToast({
        title: "Couldn't start setup",
        body: error instanceof Error ? error.message : "Try again.",
        tone: "error",
      }),
  });
  const setupAction = useMutation({
    mutationFn: ({
      action,
      values,
    }: {
      action: ChatEndpointSetupAction;
      values?: Record<string, string>;
    }) => chatEndpointsApi.setup(endpoint!.id, provider === "imessage-photon" ? {
      action,
      ...(values?.projectSecret ? { credentials: { projectSecret: values.projectSecret } } : {}),
      ...(values?.projectId && values.allocation === "shared" ? { photon: { allocation: "shared" as const, projectId: values.projectId } } : values?.projectId && values?.lineId ? { photon: { allocation: "dedicated" as const, projectId: values.projectId, lineId: values.lineId } } : {}),
    } : { action, credentials: values }),
    onMutate: () => setSetupError(null),
    onSuccess: (next) => {
      setSetupError(null);
      syncEndpointSnapshot(next);
      setCredentials({});
    },
    onError: (error, variables) =>
      setSetupError(sanitizedSetupErrorMessage(error, variables.values)),
  });
  const generateSetupSecret = useMutation({
    mutationFn: () => chatEndpointsApi.generateSetupSecret(endpoint!.id),
    onMutate: async () => {
      const endpointId = endpoint!.id;
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: ["chat-endpoint-github-webhook-verification", endpointId],
          exact: true,
        }),
        queryClient.cancelQueries({
          queryKey: ["chat-endpoint-setup-resume", endpointId],
          exact: true,
        }),
        queryClient.cancelQueries({
          queryKey: queryKeys.chatEndpoints.detail(endpointId),
          exact: true,
        }),
      ]);
      return { endpointId };
    },
    onSuccess: async ({ webhookSecret }, _variables, context) => {
      const endpointId = context.endpointId;
      const markRotated = (current: ChatEndpoint) => ({
        ...current,
        setup: {
          ...current.setup,
          step: "provider_setup" as const,
          webhookSecretConfigured: true,
          webhookVerifiedAt: null,
        },
      });

      queryClient.removeQueries({
        queryKey: ["chat-endpoint-github-webhook-verification", endpointId],
        exact: true,
      });
      setGeneratedWebhookSecret(webhookSecret);
      setEndpoint((current) =>
        current && current.id === endpointId ? markRotated(current) : current,
      );
      queryClient.setQueryData<ChatEndpoint>(
        ["chat-endpoint-setup-resume", endpointId],
        (current) => (current ? markRotated(current) : current),
      );
      queryClient.setQueryData<ChatEndpoint>(
        queryKeys.chatEndpoints.detail(endpointId),
        (current) => (current ? markRotated(current) : current),
      );

      try {
        const current = await chatEndpointsApi.get(endpointId);
        syncEndpointSnapshot(current, true);
      } catch {
        // Keep the one-time secret copyable. Verification polling will retry the
        // canonical endpoint read without restoring a pre-rotation snapshot.
      }
    },
    onError: (error) =>
      pushToast({
        title: uiText("Couldn't generate webhook secret"),
        body: error instanceof Error ? error.message : uiText("Try again."),
        tone: "error",
      }),
  });
  const testConnection = useMutation({
    mutationFn: () => chatEndpointsApi.test(endpoint!.id),
    onSuccess: (next) => {
      syncEndpointSnapshot(next);
      if (next.status === "active") navigate(`/apps/chat/${next.id}/settings`);
    },
    onError: (error) =>
      pushToast({
        title: uiText("Test not complete"),
        body:
          error instanceof Error
            ? error.message
            : uiText("Send the provider message, then try again."),
        tone: "error",
      }),
  });

  if (!provider)
    return (
      <p className="text-sm text-destructive">
        {uiText("This chat provider is not supported.")}
      </p>
    );
  if (!selectedCompanyId)
    return (
      <p className="text-sm text-muted-foreground">
        {uiText("Select an organization to connect chat.")}
      </p>
    );

  if (purpose === "choice") {
    return (
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-xl font-bold">{uiText("Choose how to connect")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {uiText("What should this {provider} connection do?", { provider: providerNames[provider] })}
          </p>
        </div>
        <div className="grid gap-3">
          <button
            type="button"
            className="rounded-xl border border-border p-4 text-left hover:bg-accent/40"
            onClick={() => setPurpose("chat")}
          >
            <span className="block text-sm font-semibold">
              {uiText("Chat with an agent")}
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">
              {uiText("People in {provider} can start and continue Paperclip tasks.", { provider: providerNames[provider] })}
            </span>
          </button>
          <button
            type="button"
            className="rounded-xl border border-border p-4 text-left hover:bg-accent/40"
            onClick={() => navigate(toolHref)}
          >
            <span className="block text-sm font-semibold">
              {uiText("Use this connection as an agent tool")}
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">
              {uiText("Let agents use {provider} actions and data while they work.", { provider: providerNames[provider] })}
            </span>
          </button>
        </div>
      </div>
    );
  }

  const repairing = isChatEndpointRepairing(
    endpoint,
    resumeEndpointId,
    reconnectRequested,
  );
  const step = endpoint
    ? !repairing &&
      (endpoint.setup?.step === "test" || endpoint.setup?.step === "complete")
      ? 2
      : 1
    : 0;
  const selectedAgent = activeAgents.find((agent) => agent.id === agentId);
  return (
    <div className="grid max-w-4xl gap-8 md:grid-cols-(--gtc-11)">
      <SetupRail step={step} />
      <main className="min-w-0 space-y-6">
        {!endpoint ? (
          <>
            <div>
              <h1 className="text-xl font-bold">
                {uiText("Which agent do you want to chat with?")}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {uiText("This agent is permanent for the connection. Connect another channel to represent a different agent.")}
              </p>
            </div>
            <AgentSelect
              agents={activeAgents}
              value={agentId}
              onChange={setAgentId}
              placeholder={uiText("Choose an active agent")}
              emptyMessage={uiText("No active agents are available.")}
            />
            <div className="flex justify-end">
              <Button
                disabled={!agentId || createEndpoint.isPending}
                onClick={() => createEndpoint.mutate()}
              >
                {createEndpoint.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {uiText("Continue")}
              </Button>
            </div>
          </>
        ) : step === 1 ? (
          <>
            {setupError ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
              >
                <p className="font-medium">{uiText("Connection failed")}</p>
                <p className="mt-1">{setupError}</p>
              </div>
            ) : null}
            <ProviderConnectStep
              key={`${provider}:${endpoint.id}`}
              provider={provider}
              agentName={selectedAgent?.name ?? endpoint.assignedAgentName}
              endpoint={endpoint}
              credentials={credentials}
              setCredentials={setCredentials}
              repairing={repairing}
              pending={setupAction.isPending}
              generatedWebhookSecret={generatedWebhookSecret}
              generatingSetupSecret={generateSetupSecret.isPending}
              onGenerateSetupSecret={() => generateSetupSecret.mutate()}
              onAction={(action, values) =>
                setupAction.mutate({ action, values })
              }
            />
          </>
        ) : (
          <TryStep
            endpointId={endpoint.id}
            provider={provider}
            agentName={selectedAgent?.name ?? endpoint.assignedAgentName}
            botLabel={endpoint.botLabel}
            botUsername={endpoint.botUsername}
            photonAllocation={endpoint.photonAllocation}
            providerUrl={endpoint.setup?.providerUrl}
            guestIsolationState={
              experimentalSettingsQuery.isPending
                ? "loading"
                : experimentalSettingsQuery.isError
                  ? "unknown"
                  : experimentalSettingsQuery.data?.enableIsolatedWorkspaces ===
                      true
                    ? "enabled"
                    : "disabled"
            }
            pending={testConnection.isPending}
            onOpenAccess={() => navigate(`/apps/chat/${endpoint.id}/access`)}
            onTest={() => testConnection.mutate()}
          />
        )}
        <div className="flex justify-start">
          <Button variant="ghost" onClick={() => navigate("/apps")}>
            {uiText("Save & exit")}
          </Button>
        </div>
      </main>
    </div>
  );
}

function ProviderConnectStep({
  provider,
  agentName,
  endpoint,
  credentials,
  setCredentials,
  repairing,
  pending,
  generatedWebhookSecret,
  generatingSetupSecret,
  onGenerateSetupSecret,
  onAction,
}: {
  provider: ChatProvider;
  agentName: string;
  endpoint: ChatEndpoint;
  credentials: Record<string, string>;
  setCredentials: Dispatch<SetStateAction<Record<string, string>>>;
  repairing: boolean;
  pending: boolean;
  generatedWebhookSecret: string;
  generatingSetupSecret: boolean;
  onGenerateSetupSecret: () => void;
  onAction: (
    action: ChatEndpointSetupAction,
    values?: Record<string, string>,
  ) => void;
}) {
  const { pushToast } = useToast();
  const reportCopyFailure = () =>
    pushToast({
      title: uiText("Couldn't copy to clipboard"),
      body: uiText("Select and copy the value manually."),
      tone: "error",
    });
  const field = (key: string, label: string, type = "password") => (
    <label className="grid gap-2 text-sm font-medium">
      {uiText(label)}
      <Input
        type={type}
        value={credentials[key] ?? ""}
        onChange={(event) =>
          setCredentials({ ...credentials, [key]: event.target.value })
        }
      />
    </label>
  );
  const openProviderSetup = (fallback: string) =>
    window.open(
      endpoint.setup?.authorizationUrl ??
        endpoint.setup?.providerUrl ??
        fallback,
      "_blank",
      "noopener,noreferrer",
    );
  const endpointValue = (label: string, value: string | null | undefined) => (
    <div className="grid gap-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="rounded-lg border border-border bg-muted p-3 font-mono text-xs break-all">
        {value ??
          uiText("This endpoint is unavailable. Check the server's public URL.")}
      </div>
    </div>
  );
  const [manifestCopied, setManifestCopied] = useState(false);
  const [privateKeyVisible, setPrivateKeyVisible] = useState(false);
  const [privateKeyFileError, setPrivateKeyFileError] = useState<string | null>(
    null,
  );
  const [privateKeyFileLoaded, setPrivateKeyFileLoaded] = useState(false);
  const [privateKeyFileLoading, setPrivateKeyFileLoading] = useState(false);
  const privateKeyFileInputRef = useRef<HTMLInputElement>(null);
  const privateKeyReadGuard = useRef(createGitHubPrivateKeyReadGuard()).current;
  useEffect(
    () => () => {
      privateKeyReadGuard.invalidate();
    },
    [privateKeyReadGuard],
  );
  const loadPrivateKeyFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    const readRevision = privateKeyReadGuard.start();
    setPrivateKeyFileError(null);
    setPrivateKeyFileLoaded(false);
    setPrivateKeyFileLoading(true);
    try {
      const privateKey = await readGitHubPrivateKeyFile(file);
      if (!privateKeyReadGuard.isCurrent(readRevision)) return;
      setCredentials((current) => ({ ...current, privateKey }));
      setPrivateKeyVisible(false);
      setPrivateKeyFileLoaded(true);
    } catch (error) {
      if (!privateKeyReadGuard.isCurrent(readRevision)) return;
      setPrivateKeyFileError(
        error instanceof Error
          ? error.message
          : "Paperclip couldn't read that file. Choose the .pem file again or paste the private key.",
      );
    } finally {
      if (privateKeyReadGuard.isCurrent(readRevision)) {
        setPrivateKeyFileLoading(false);
      }
    }
  };
  const replacePrivateKey = (privateKey: string) => {
    privateKeyReadGuard.invalidate();
    setPrivateKeyFileError(null);
    setPrivateKeyFileLoaded(false);
    setPrivateKeyFileLoading(false);
    setCredentials((current) => ({ ...current, privateKey }));
  };
  const slackCommand =
    endpoint.setup?.command ??
    `/${
      agentName
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 24) || "paperclip"
    }`;
  const slackBotName = slackBotNameForAgent(agentName);
  const slackAppName = `${slackBotName.slice(0, 25)}-paperclip`;
  const slackWebhookUrl =
    endpoint.setup?.webhookUrl ?? "<paperclip-webhook-url>";
  const slackManifest = `display_information:
  name: ${JSON.stringify(slackAppName)}
features:
  app_home:
    home_tab_enabled: false
    messages_tab_enabled: true
    messages_tab_read_only_enabled: false
  agent_view:
    agent_description: "Work with a Paperclip agent in a task-backed conversation."
  bot_user:
    display_name: ${JSON.stringify(slackBotName)}
  slash_commands:
    - command: ${JSON.stringify(slackCommand)}
      description: Start or manage work with ${JSON.stringify(agentName)}
      usage_hint: ${JSON.stringify("status | new | close | <task>")}
      should_escape: false
      url: ${JSON.stringify(slackWebhookUrl)}
oauth_config:
  scopes:
    bot:
      - app_mentions:read
      - assistant:write
      - channels:history
      - channels:read
      - chat:write
      - commands
      - files:read
      - files:write
      - groups:history
      - groups:read
      - im:history
      - im:read
      - mpim:history
      - mpim:read
      - reactions:read
      - reactions:write
      - users:read
settings:
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
  event_subscriptions:
    request_url: ${JSON.stringify(slackWebhookUrl)}
    bot_events:
      - agent_session_stopped
      - app_mention
      - message.channels
      - message.groups
      - message.im
      - message.mpim
      - member_joined_channel
      - member_left_channel
      - channel_left
      - group_left
      - reaction_added
      - reaction_removed
      - channel_archive
      - group_archive
      - channel_unarchive
      - group_unarchive
      - channel_deleted
      - channel_rename
      - group_rename
      - app_uninstalled
      - tokens_revoked
  interactivity:
    is_enabled: true
    request_url: ${JSON.stringify(slackWebhookUrl)}`;
  const teamsClientId =
    credentials.clientId?.trim() || "<application-client-id>";
  const teamsManifestSettings = JSON.stringify(
    {
      bots: [
        {
          botId: teamsClientId,
          scopes: ["personal", "team", "groupChat"],
          supportsFiles: true,
          isNotificationOnly: false,
          commandLists: [
            {
              scopes: ["personal", "groupChat"],
              commands: [
                {
                  title: "/status",
                  description: "Show the active Paperclip task status",
                },
                {
                  title: "/new",
                  description: "Start a new Paperclip task in this chat",
                },
                {
                  title: "/close",
                  description: "Close the active chat conversation",
                },
              ],
            },
          ],
        },
      ],
      webApplicationInfo: {
        id: teamsClientId,
        resource: "https://paperclip.ing",
      },
      authorization: {
        permissions: {
          resourceSpecific: [
            { name: "ChannelMessage.Read.Group", type: "Application" },
            { name: "ChatMessage.Read.Chat", type: "Application" },
          ],
        },
      },
    },
    null,
    2,
  );
  if (provider === "imessage-photon") return <PhotonConnectStep endpoint={endpoint} agentName={agentName} repairing={repairing} pending={pending} onAction={onAction} />;
  if (provider === "discord") {
    const applicationId = credentials.applicationId?.trim() ?? "";
    const guildId = credentials.guildId?.trim() ?? "";
    const installUrl = applicationId
      ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(applicationId)}&permissions=309237763136&scope=bot${guildId ? `&guild_id=${encodeURIComponent(guildId)}&disable_guild_select=true` : ""}`
      : null;
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold">{uiText("Connect")} {agentName} {uiText("to Discord")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {repairing
              ? uiText("Reconnect verifies this same Discord application and server installation. It does not add or remove the bot from the server. Leave fields blank to reuse saved credentials.")
              : uiText("Create one dedicated Discord application and bot for this Paperclip agent.")}
          </p>
        </div>
      <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            {uiText("In Discord Developer Portal, create an application. Copy its Application ID from General Information.")}
          </li>
          <li>
            {uiText("Open Bot, create the bot, enable Message Content Intent, then reset and copy its token.")}
          </li>
          <li>
            {uiText("Enable Developer Mode in Discord, right-click the target server, and copy its Server ID.")}
          </li>
          <li>
            {uiText("Enter those values below, then use the generated install link to add the bot to that server.")}
          </li>
        </ol>
        <Button
          variant="outline"
          onClick={() =>
            openProviderSetup("https://discord.com/developers/applications")
          }
        >
          {uiText("Open Discord Developer Portal")} <ExternalLink />
        </Button>
        {field("applicationId", "Application ID", "text")}
        {field("guildId", "Server ID", "text")}
        {field("botToken", "Bot token")}
        {installUrl && (
          <Button asChild variant="outline">
            <a href={installUrl} target="_blank" rel="noreferrer">
              {uiText("Install bot in this server")} <ExternalLink />
            </a>
          </Button>
        )}
        <p className="text-sm text-muted-foreground">
          {uiText("The install link grants only View Channels, Send Messages, Create Public Threads, Send Messages in Threads, Read Message History, Add Reactions, Embed Links, and Attach Files. Paperclip still requires each discovered channel to be enabled in Access.")}
        </p>
        <Button
          disabled={
            (!repairing &&
              (!credentials.applicationId ||
                !credentials.guildId ||
                !credentials.botToken)) ||
            pending
          }
          onClick={() =>
            onAction(repairing ? "reconnect" : "configure", credentials)
          }
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {repairing ? uiText("Reconnect Discord bot") : uiText("Connect Discord bot")}
        </Button>
      </div>
    );
  }
  if (provider === "telegram")
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold">{uiText("Create")} {agentName} {uiText("in Telegram")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {repairing
              ? uiText("Reconnect verifies this same BotFather bot and automatically refreshes its Paperclip webhook and command menu. It does not recreate the bot or change its chat memberships. Leave the token blank to reuse the saved credential.")
              : uiText("Create a bot with BotFather, then paste the token it gives you.")}
          </p>
        </div>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            {uiText("Open BotFather and send")} <code>/newbot</code>.
          </li>
          <li>{uiText("Enter the bot display name.")}</li>
          <li>
            {uiText("Choose an available username ending in")} <code>bot</code>.
          </li>
        </ol>
        <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          {uiText("Paperclip works with Telegram's default bot privacy mode and registers its command menu automatically. In a group, ordinary mentions are not delivered to bots: start or continue work with")}{" "}
          <code>/task@bot_username &lt;request&gt;</code>{uiText(", or reply directly to a message from the bot.")}
        </p>
        <Button
          variant="outline"
          onClick={() => openProviderSetup("https://t.me/BotFather")}
        >
          {uiText("Open BotFather")} <ExternalLink />
        </Button>
        {field("botToken", "Bot token")}
        {!endpoint.setup?.webhookUrl && (
          <p className="text-sm text-destructive">
            {uiText("Configure a public HTTPS URL for this Paperclip instance before connecting Telegram.")}
          </p>
        )}
        <Button
          disabled={
            (!repairing && !credentials.botToken) ||
            !endpoint.setup?.webhookUrl ||
            pending
          }
          onClick={() =>
            onAction(repairing ? "reconnect" : "configure", credentials)
          }
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {repairing ? uiText("Reconnect bot") : uiText("Connect bot")}
        </Button>
      </div>
    );
  if (provider === "microsoft-teams")
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold">
            {uiText("Connect")} {agentName} {uiText("to Microsoft Teams")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {repairing
              ? uiText("Reconnect verifies this same Microsoft app, tenant, and bot identity. It does not upload or reinstall the Teams app. Leave fields blank to reuse saved credentials.")
              : uiText("Use your own Microsoft app credentials for this bot.")}
          </p>
        </div>
        <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          {uiText("This setup requires a Microsoft 365 work or school organization where you can register an Entra app, create an Azure Bot, and upload or install a Teams app. Personal or free Teams accounts at teams.live.com cannot complete this setup. This release supports Microsoft 365 commercial cloud tenants only; GCC, GCC High, DoD, and Microsoft 365 operated by 21Vianet are not supported yet.")}
        </p>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            {uiText("In Microsoft Entra, create a single-tenant app registration. Copy its Application (client) ID and Directory (tenant) ID, then create a client secret and copy its value.")}
          </li>
          <li>
            {uiText("In Azure, create an Azure Bot. Choose Single Tenant, use that Application ID, set its messaging endpoint to the Paperclip URL below, and add the Microsoft Teams channel.")}
          </li>
          <li>
            {uiText("In Teams Developer Portal, create an app, add a bot with the same Application ID, then apply the manifest settings shown below. The block binds the Teams resource-specific consent permissions to that Entra app; these are not Microsoft Graph permissions in Entra. These permissions let the installed app receive every message in a team or group chat without an @mention, so describe that access to installers. Download the package and install it in the target team or group chat.")}
          </li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a
              href="https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
              target="_blank"
              rel="noreferrer"
            >
              {uiText("Open Microsoft Entra")} <ExternalLink />
            </a>
          </Button>
          <Button asChild variant="outline">
            <a
              href="https://portal.azure.com/#create/Microsoft.AzureBot"
              target="_blank"
              rel="noreferrer"
            >
              {uiText("Create Azure Bot")} <ExternalLink />
            </a>
          </Button>
          <Button asChild variant="outline">
            <a
              href="https://dev.teams.microsoft.com/apps"
              target="_blank"
              rel="noreferrer"
            >
              {uiText("Open Teams Developer Portal")} <ExternalLink />
            </a>
          </Button>
        </div>
        {endpointValue(
          "Paperclip messaging endpoint",
          endpoint.setup?.messagingEndpoint,
        )}
        {field("clientId", "Application / Client ID", "text")}
        {field("tenantId", "Directory / Tenant ID", "text")}
        {field("clientSecret", "Client secret value")}
        <section className="space-y-3 rounded-lg border border-border p-4">
          <div>
            <h2 className="text-sm font-semibold">
              {uiText("Microsoft portal field map")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {uiText("Use these exact portal sections and reuse the same Application ID in all three places.")}
            </p>
          </div>
          <ol className="list-decimal space-y-3 pl-5 text-sm">
            <li>
              <strong>{uiText("Microsoft Entra admin center · App registrations")}</strong>:
              {uiText("select")} <strong>{uiText("New registration")}</strong>, {uiText("choose")} {" "}
              <strong>{uiText("Accounts in this organizational directory only (Single tenant)")}</strong>
              {uiText(", then select")} <strong>{uiText("Register")}</strong>. {uiText("Copy")} {" "}
              <strong>{uiText("Application (client) ID")}</strong>{" "}{uiText("and")}{" "}
              <strong>{uiText("Directory (tenant) ID")}</strong>{uiText(". Under")} {" "}
              <strong>{uiText("Certificates & secrets · Client secrets")}</strong>,
              {uiText("select")} <strong>{uiText("New client secret")}</strong> {uiText("and copy its")} {" "}
              <strong>{uiText("Value")}</strong>{uiText(", not its Secret ID.")}
            </li>
            <li>
              <strong>{uiText("Azure · Create Azure Bot")}</strong>: {uiText("set")} {" "}
              <strong>{uiText("Microsoft App ID")}</strong> {uiText("to")} {" "}
              <strong>{uiText("Single Tenant")}</strong>, {uiText("set")} <strong>{uiText("Creation type")}</strong>{" "}
              {uiText("to")} <strong>{uiText("Use existing app registration")}</strong>, {uiText("and enter the Application ID and Tenant ID above. After creation, open")} {" "}
              <strong>{uiText("Settings · Configuration")}</strong> {uiText("and paste the Paperclip")} {" "}
              <strong>{uiText("Messaging endpoint")}</strong>{uiText("; then open")} {" "}
              <strong>{uiText("Settings · Channels")}</strong> {uiText("and enable")} {" "}
              <strong>{uiText("Microsoft Teams")}</strong>.
            </li>
            <li>
              <strong>{uiText("Teams Developer Portal · Apps")}</strong>: {uiText("select")} {" "}
              <strong>{uiText("New app")}</strong>. {uiText("Under")} {" "}
              <strong>{uiText("Configure · App features · Bot")}</strong>, {uiText("add an existing bot using the same Application ID; enable")} {" "}
              <strong>{uiText("Personal")}</strong>, <strong>团队</strong>{uiText(", and")}{" "}
              <strong>{uiText("Group chat")}</strong> {uiText("scopes plus file support. Under")} {" "}
              <strong>{uiText("Configure · Permissions")}</strong>, {uiText("add the two RSC")} {" "}
              <strong>{uiText("Application")}</strong> {uiText("permissions shown below. Complete the required app details and icons, explain that the app can receive every message in an installed team or group chat, then download the app package.")}
            </li>
            <li>
              <strong>{uiText("Microsoft Teams · Apps · Manage your apps")}</strong>: {uiText("select")} {" "}
              <strong>{uiText("Upload an app · Upload a custom app")}</strong>, {uiText("choose the downloaded package, and install it in each intended personal chat, group chat, or team. One team install covers its standard channels. Private and shared channels require a separate app installation and are not supported by this release. If upload is unavailable, a Teams administrator must enable or approve custom apps.")}
            </li>
          </ol>
        </section>
        <label className="grid gap-2 text-sm font-medium">
              {uiText("Required Teams app manifest block")}
          <Textarea
            className="min-h-80 font-mono text-xs"
            readOnly
            value={teamsManifestSettings}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!credentials.clientId?.trim()}
            onClick={() => {
              void copyTextToClipboard(teamsManifestSettings).then(
                () => setManifestCopied(true),
                reportCopyFailure,
              );
            }}
          >
            {manifestCopied
              ? uiText("Manifest settings copied")
              : uiText("Copy manifest settings")}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {uiText("Enter the Application / Client ID above before copying so the block contains the real bot identity. This block contains the Paperclip-specific fields to verify in Developer Portal or merge into a complete Teams app manifest. It is not a complete app package; Developer Portal supplies the remaining required metadata and packages the manifest with your app icons.")}
        </p>
        <p className="text-sm text-muted-foreground">
          {uiText("Paperclip does not use Teams single sign-on in this release. The copied")} <code>webApplicationInfo</code> {uiText("entry only associates the RSC permissions with the same Entra Application ID. Its nonempty resource is an RSC placeholder; you do not need to register an Entra Application ID URI or add delegated Microsoft Graph permissions.")}
        </p>
        <p className="text-sm text-muted-foreground">
          {uiText("The two application RSC permissions let the bot receive every message, without an @mention, in each team or group chat where it is installed. Paperclip retains and acts only on messages admitted by your Paperclip reach and access rules. Make this provider access clear in the app description shown to installers.")}
        </p>
        <p className="text-sm text-muted-foreground">
          {uiText("This release supports personal chats, group chats, and standard team channels—not private channels.")} <code>supportsFiles: true</code>{" "}
          {uiText("enables native file receipt and consent-based sending in personal chats; channel and group-chat files need a separate Microsoft Graph connection and are not ingested here.")}
        </p>
        {!endpoint.setup?.messagingEndpoint && (
          <p className="text-sm text-destructive">
            {uiText("Configure a public HTTPS URL for this Paperclip instance before connecting Microsoft Teams.")}
          </p>
        )}
        <Button
          disabled={
            (!repairing &&
              (!credentials.clientId ||
                !credentials.tenantId ||
                !credentials.clientSecret)) ||
            !endpoint.setup?.messagingEndpoint ||
            pending
          }
          onClick={() =>
            onAction(repairing ? "reconnect" : "configure", credentials)
          }
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {repairing
            ? uiText("Reconnect Microsoft app")
            : uiText("Verify Microsoft credentials")}
        </Button>
      </div>
    );
  if (provider === "github")
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold">
            {repairing
              ? uiText("Reconnect GitHub App")
              : uiText("Create or connect a GitHub App")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {repairing
              ? uiText("Reconnect verifies this same App and installation, then updates its webhook URL, secret, and secure delivery settings. It does not reinstall the App or change repository access. Leave App ID and private key blank to reuse saved credentials. Keep Webhooks · Active enabled in GitHub; send a test conversation after reconnecting.")
              : uiText("Configure its webhook and permissions, then verify the App with Paperclip.")}
          </p>
        </div>
        {!repairing && (
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>
              {uiText("Under the target user or organization, create a new GitHub App. Give it a globally unique name (34 characters or fewer), use the Paperclip homepage URL below, and leave user authorization off.")}
            </li>
            <li>
              {uiText("Keep")} <strong>{uiText("Webhooks · Active")}</strong> {uiText("on. Enter the Paperclip webhook URL and the Paperclip-generated webhook secret below, and keep")} <strong>{uiText("Enable SSL verification")}</strong> {uiText("selected.")}
            </li>
            <li>
              {uiText("Under Repository permissions, set")} <strong>{uiText("Issues")}</strong> {uiText("and")} <strong>{uiText("Pull requests")}</strong> {uiText("to")} <strong>{uiText("Read & write")}</strong>{uiText(". Leave every other permission at its default; Metadata remains read-only.")}
            </li>
            <li>
              {uiText("Subscribe to")} <strong>{uiText("Issue comment")}</strong> (
              <code>issue_comment</code>),{" "}
              <strong>{uiText("Pull request review comment")}</strong> (
              <code>pull_request_review_comment</code>). {uiText("GitHub sends")} {" "}
              <code>installation</code> {uiText("and")} {" "}
              <code>installation_repositories</code> {uiText("to every GitHub App automatically; they are not selectable here.")}
            </li>
            <li>
              {uiText("Choose")} <strong>{uiText("Only on this account")}</strong>{uiText(", create the App, copy its App ID, generate one private key, then install it on the selected repositories.")}
            </li>
          </ol>
        )}
        {endpointValue(
          "Paperclip homepage URL",
          publicOrigin(endpoint.setup?.webhookUrl),
        )}
        {endpointValue("Paperclip webhook URL", endpoint.setup?.webhookUrl)}
        <Button
          variant="outline"
          onClick={() =>
            window.open(
              repairing
                ? "https://github.com/settings/apps"
                : (endpoint.setup?.authorizationUrl ??
                    "https://github.com/settings/apps/new"),
              "_blank",
              "noopener,noreferrer",
            )
          }
        >
          {repairing ? uiText("Open GitHub App settings") : uiText("Open new GitHub App form")}{" "}
          <ExternalLink />
        </Button>
        {field("appId", "GitHub App ID", "text")}
        <div className="grid gap-2 text-sm font-medium">
          <label htmlFor="github-private-key">{uiText("Private key (PEM)")}</label>
          <div className="relative">
            {privateKeyVisible ? (
              <Textarea
                id="github-private-key"
                className="min-h-24 pr-11 font-mono text-xs"
                value={credentials.privateKey ?? ""}
                onChange={(event) => replacePrivateKey(event.target.value)}
              />
            ) : (
              <Input
                id="github-private-key"
                type="password"
                className="pr-11 font-mono text-xs"
                value={credentials.privateKey ?? ""}
                onChange={(event) => replacePrivateKey(event.target.value)}
                onPaste={(event) => {
                  event.preventDefault();
                  replacePrivateKey(event.clipboardData.getData("text"));
                }}
              />
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1"
              aria-label={
                privateKeyVisible ? uiText("Hide private key") : uiText("Show private key")
              }
              onClick={() => setPrivateKeyVisible((visible) => !visible)}
            >
              {privateKeyVisible ? <EyeOff /> : <Eye />}
            </Button>
          </div>
          <input
            ref={privateKeyFileInputRef}
            type="file"
            accept=".pem,.key,application/x-pem-file,application/pkcs8,text/plain"
            className="hidden"
            aria-label={uiText("Choose GitHub App private key file")}
            onChange={loadPrivateKeyFile}
          />
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => privateKeyFileInputRef.current?.click()}
            >
              {uiText("Choose .pem file")}
            </Button>
          </div>
          {privateKeyFileError ? (
            <p role="alert" className="text-sm text-destructive">
              {privateKeyFileError}
            </p>
          ) : null}
          {privateKeyFileLoading ? (
            <p
              role="status"
              aria-live="polite"
              className="text-sm text-muted-foreground"
            >
              {uiText("Reading private key file…")}
            </p>
          ) : privateKeyFileLoaded ? (
            <p
              role="status"
              aria-live="polite"
              className="text-sm text-muted-foreground"
            >
              {uiText("Private key loaded. It stays in this form until you connect.")}
            </p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <p className="text-sm font-medium">{uiText("Webhook secret")}</p>
          {generatedWebhookSecret ? (
            <>
              <Input
                aria-label={uiText("Generated webhook secret")}
                className="font-mono text-xs"
                readOnly
                value={generatedWebhookSecret}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void copyTextToClipboard(generatedWebhookSecret).catch(
                      reportCopyFailure,
                    );
                  }}
                >
                  {uiText("Copy webhook secret")}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {uiText("Copy this value now. Paperclip will not show it again.")}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {endpoint.setup?.webhookSecretConfigured
                ? uiText("A webhook secret is configured and cannot be shown again.")
                : uiText("Generate the secret in Paperclip, then paste it into the GitHub App.")}
            </p>
          )}
          <div>
            <Button
              type="button"
              variant="outline"
              disabled={generatingSetupSecret}
              onClick={onGenerateSetupSecret}
            >
              {generatingSetupSecret && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {endpoint.setup?.webhookSecretConfigured
                ? uiText("Regenerate webhook secret")
                : uiText("Generate webhook secret")}
            </Button>
          </div>
          {endpoint.setup?.webhookSecretConfigured && (
            <p className="text-sm text-muted-foreground">
              {endpoint.providerAccountId || endpoint.botExternalId
                ? uiText("Regenerating immediately invalidates GitHub webhook signatures until you replace the secret in the GitHub App settings.")
                : uiText("Generating another secret replaces the previous value. Paste the newest value into GitHub before continuing.")}
            </p>
          )}
          {endpoint.setup?.webhookSecretConfigured && (
            <p
              className={`text-sm ${endpoint.setup.webhookVerifiedAt ? "text-foreground" : "text-muted-foreground"}`}
            >
              {endpoint.setup.webhookVerifiedAt
                ? uiText("GitHub has verified this webhook.")
                : uiText("Waiting for GitHub to deliver its signed webhook ping…")}
            </p>
          )}
        </div>
        {!endpoint.setup?.webhookUrl && (
          <p className="text-sm text-destructive">
            {uiText("Configure a public HTTPS URL for this Paperclip instance before connecting GitHub.")}
          </p>
        )}
        <Button
          disabled={
            (!repairing && (!credentials.appId || !credentials.privateKey)) ||
            !endpoint.setup?.webhookSecretConfigured ||
            !endpoint.setup?.webhookVerifiedAt ||
            !endpoint.setup?.webhookUrl ||
            privateKeyFileLoading ||
            generatingSetupSecret ||
            pending
          }
          onClick={() =>
            onAction(repairing ? "reconnect" : "configure", credentials)
          }
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {repairing ? uiText("Reconnect and verify") : uiText("Connect and verify")}
        </Button>
      </div>
    );
  if (endpoint.providerAccountId && !repairing)
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold">{uiText("Finish Slack setup")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {uiText("Point the Slack app at Paperclip now that its signing secret is connected.")}
          </p>
        </div>
        {endpointValue("Paperclip webhook URL", endpoint.setup?.webhookUrl)}
        {endpointValue("Slack command", slackCommand)}
        <div className="rounded-lg border border-border p-3 text-sm">
          <p className="font-medium">{uiText("Use the registered command")}</p>
          <p className="mt-1 text-muted-foreground">
            {uiText("Start work with")} <code>{slackCommand} investigate this</code>{uiText(". In a direct message, use")} <code>{slackCommand} status</code>,{" "}
            <code>{slackCommand} new</code>{uiText(", or")} {" "}
            <code>{slackCommand} close</code>{uiText(". Slack's bare")} {" "}
            <code>/status</code> {uiText("command is not a Paperclip control.")}
          </p>
        </div>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            {uiText("Return to")} <strong>{uiText("App Manifest")}</strong> {uiText("in Slack and click")} {" "}
            <strong>{uiText("Save Changes")}</strong>. {uiText("The copied manifest already contains the event, interaction, and slash-command URLs. Slack verifies the Events URL when you save; Paperclip records Interactivity and slash command health only after each signed callback is observed.")}
          </li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => openProviderSetup("https://api.slack.com/apps")}
          >
            {uiText("Open Slack app settings")} <ExternalLink />
          </Button>
          <Button disabled={pending} onClick={() => onAction("verify")}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {uiText("Start Slack message test")}
          </Button>
        </div>
      </div>
    );
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">{uiText("Connect a Slack app")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {repairing
            ? uiText("Reconnect verifies or replaces credentials for this same Slack app. It does not reinstall the app or change its workspace or channel membership. Leave credentials blank to reuse the saved values.")
            : uiText("Bring your own Slack app. The manifest requests the scopes Paperclip needs; credentials remain write-only.")}
        </p>
      </div>
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>
          {uiText("Copy the manifest, then create a Slack app")} {" "}
          <strong>{uiText("From an app manifest")}</strong>{uiText("in the target workspace.")}</li>
        <li>
          {uiText("Open")} <strong>{uiText("OAuth & Permissions")}</strong>{uiText(", install the app to the workspace, and copy its Bot User OAuth Token.")}
        </li>
        <li>
          {uiText("Open")} <strong>{uiText("Basic Information")}</strong> {uiText("and copy its Signing Secret.")}
        </li>
      </ol>
      <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">{uiText("Slack app name")}</span>
          <code>{slackAppName}</code>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">{uiText("Bot display name")}</span>
          <code>{slackBotName}</code>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">{uiText("Slash command")}</span>
          <code>{slackCommand}</code>
        </div>
      </div>
      <label className="grid gap-2 text-sm font-medium">
        {uiText("Slack app manifest")}
        <Textarea
          className="min-h-56 font-mono text-xs"
          readOnly
          value={slackManifest}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => {
            void copyTextToClipboard(slackManifest).then(
              () => setManifestCopied(true),
              reportCopyFailure,
            );
          }}
        >
          {manifestCopied ? uiText("Manifest copied") : uiText("Copy manifest")}
        </Button>
        <Button
          variant="outline"
          onClick={() => openProviderSetup("https://api.slack.com/apps")}
        >
          {uiText("Open Slack app settings")} <ExternalLink />
        </Button>
      </div>
      {field("botToken", "Bot User OAuth Token")}
      {field("signingSecret", "Signing Secret")}
      {!endpoint.setup?.webhookUrl && (
        <p className="text-sm text-destructive">
          {uiText("Configure a public HTTPS URL for this Paperclip instance before connecting Slack.")}
        </p>
      )}
      <Button
        disabled={
          (!repairing &&
            (!credentials.botToken || !credentials.signingSecret)) ||
          !endpoint.setup?.webhookUrl ||
          pending
        }
        onClick={() =>
          onAction(repairing ? "reconnect" : "configure", credentials)
        }
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {repairing ? uiText("Reconnect Slack app") : uiText("Connect Slack app")}
      </Button>
    </div>
  );
}

function TryStep({
  endpointId,
  provider,
  agentName,
  botLabel,
  botUsername,
  photonAllocation,
  providerUrl,
  guestIsolationState,
  pending,
  onOpenAccess,
  onTest,
}: {
  endpointId: string;
  provider: ChatProvider;
  agentName: string;
  botLabel?: string | null;
  botUsername?: string | null;
  photonAllocation?: "dedicated" | "shared";
  providerUrl?: string | null;
  guestIsolationState: "loading" | "enabled" | "disabled" | "unknown";
  pending: boolean;
  onOpenAccess: () => void;
  onTest: () => void;
}) {
  const principalsQuery = useQuery({
    queryKey: queryKeys.chatEndpoints.principals(endpointId),
    queryFn: () => chatEndpointsApi.listPrincipals(endpointId),
    refetchInterval: 1_500,
  });
  const [numberCopied, setNumberCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const identities = principalsQuery.data ?? [];
  const unlinkedIdentities = identities.filter(
    (identity) => identity.status !== "linked",
  );
  const freshConversationInstruction =
    provider === "imessage-photon" ? uiText("send a fresh message to your Photon number") : provider === "telegram"
      ? uiText("start a fresh conversation with /new and send the test message again")
      : provider === "github"
        ? uiText("start a new issue or pull request conversation and mention the agent again")
        : provider === "microsoft-teams"
          ? uiText("start a new channel post and mention the agent again")
          : uiText("send a new root mention to the agent");
  const identityGuidance = provider === "imessage-photon" && principalsQuery.isSuccess && (identities.length === 0 || unlinkedIdentities.length > 0)
    ? { tone: "info" as const, title: uiText("Link your Messages identity"), body: uiText("Send one message to discover your phone number or Apple account address, then link that exact identity in Access. Send a fresh request after linking; earlier messages do not start work.") }
    : principalsQuery.isError
    ? {
        tone: "warning" as const,
        title: uiText("Identity readiness could not be checked"),
        body: uiText("Review Access before expecting an agent reply. After linking the account you are testing, {instruction}.", { instruction: freshConversationInstruction }),
      }
    : !principalsQuery.isSuccess || guestIsolationState === "loading"
      ? null
      : identities.length === 0
        ? guestIsolationState === "disabled"
          ? {
              tone: "warning" as const,
              title: uiText("Link the account you’re testing"),
              body:
                provider === "telegram"
                  ? uiText("Tap Start in Telegram to discover your account; the welcome does not start an agent run. Link the account privately in Access, then return and send the test message.")
                  : uiText("Your first {provider} message discovers the external account, but isolated guest work is off, so it cannot safely start {agent}. Send it once, link that account privately in Access, then {instruction}.", { provider: providerNames[provider], agent: agentName, instruction: freshConversationInstruction }),
            }
          : {
              tone: "info" as const,
              title: uiText("Your first message identifies your account"),
              body:
                provider === "telegram"
                  ? uiText("Tap Start in Telegram to discover your account. Until linked, it is a restricted guest and still needs a sandbox-backed isolated run; test that path intentionally, or link it in Access and then send the test message.")
                  : uiText("Until linked, the account is a restricted guest and still needs a sandbox-backed isolated run. Test that guest path intentionally, or link the account in Access and then {instruction}.", { instruction: freshConversationInstruction }),
            }
        : unlinkedIdentities.length > 0
          ? guestIsolationState === "disabled"
            ? {
                tone: "warning" as const,
                title: uiText("Link the account you’re testing"),
                body: uiText("An observed external account is unlinked, and isolated guest work is off, so it cannot safely start {agent}. Link the account in Access, then {instruction}; Paperclip does not replay the refused request.", { agent: agentName, instruction: freshConversationInstruction }),
              }
            : {
                tone: "info" as const,
                title: uiText("Unlinked identity detected"),
                body: uiText("An unlinked account is a restricted guest and still needs a sandbox-backed isolated run. Test guest access intentionally, or link the account in Access and then {instruction}.", { instruction: freshConversationInstruction }),
              }
          : null;
  const providerBotUsername = botUsername?.replace(/^@/, "");
  const normalizedBotUsername =
    provider === "github"
      ? providerBotUsername?.replace(/\[bot\]$/i, "")
      : providerBotUsername;
  const botMention = normalizedBotUsername
    ? `@${normalizedBotUsername}`
    : (botLabel ?? agentName);
  const instructions =
    provider === "imessage-photon" ? [
      photonAllocation === "shared" ? uiText("In your Photon project, enroll your sender in Users and find its assigned number in Get started. Send a fresh message to that number from Apple Messages.") : uiText("Open Apple Messages and send a fresh message to {destination}.", { destination: botUsername ?? botLabel ?? uiText("the dedicated number") }),
      uiText("Link the discovered sender to a Paperclip person in Access, then send a fresh request."),
      uiText("Wait for the agent’s actual reply. Setup completes after that reply is delivered."),
      ...(photonAllocation === "shared" ? [uiText("This Pro-compatible channel supports DMs only. Group messages cannot start work.")] : [uiText("For a group: add the number in Messages, send a message, enable the discovered group in Settings, then send a fresh request.")]),
    ] : provider === "discord"
      ? [
          uiText("Open a text channel where the bot is installed."),
          uiText("Mention {bot} in a new root message.", { bot: botMention }),
          uiText("Reply once inside {agent}'s new Discord thread.", { agent: agentName }),
        ]
      : provider === "telegram"
        ? [
            uiText("Open the bot’s private chat."),
            uiText("Tap Start."),
            uiText("Send “Help me test this”."),
          ]
        : provider === "github"
          ? [
              uiText("Open an installed issue or pull request."),
              uiText("Mention {bot} in a comment.", { bot: botMention }),
              uiText("Add another comment to continue the same task."),
            ]
          : provider === "microsoft-teams"
            ? [
                uiText("Open an installed channel and start a new post."),
                uiText("Mention {bot} in the post.", { bot: botMention }),
                uiText("Reply once beneath the post."),
              ]
            : [
                uiText("Open a channel and invite the bot if needed."),
                uiText("Mention {bot} in a new channel message.", { bot: botMention }),
                uiText("Reply once in {agent}'s thread.", { agent: agentName }),
              ];
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">
          {uiText("Try {agent} in {provider}", { agent: agentName, provider: providerNames[provider] })}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {uiText("Complete this real conversation to finish setup.")}
        </p>
      </div>
      {(!principalsQuery.isSuccess || guestIsolationState === "loading") &&
      !principalsQuery.isError ? (
        <p role="status" className="text-sm text-muted-foreground">
          {uiText("Checking identity and guest readiness…")}
        </p>
      ) : null}
      {identityGuidance ? (
        <div
          role={identityGuidance.tone === "warning" ? "alert" : "status"}
          className={
            identityGuidance.tone === "warning"
              ? "rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm"
              : "rounded-lg border border-border bg-muted/30 p-4 text-sm"
          }
        >
          <h2 className="font-medium">{identityGuidance.title}</h2>
          <p className="mt-1 text-muted-foreground">{identityGuidance.body}</p>
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            onClick={onOpenAccess}
          >
            {uiText("Review identity access")}
          </Button>
        </div>
      ) : null}
      {provider === "imessage-photon" && botUsername && <div className="space-y-2"><Button variant="outline" onClick={() => { void copyTextToClipboard(botUsername).then(() => { setNumberCopied(true); setCopyError(null); }, () => setCopyError(uiText("Could not copy the number. Select it in the instructions below."))); }}>{numberCopied ? uiText("Number copied") : uiText("Copy {number}", { number: botUsername })}</Button>{copyError && <p role="alert" className="text-sm text-destructive">{copyError}</p>}</div>}
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        {instructions.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        {providerUrl && (
          <Button asChild variant="outline">
            <a href={providerUrl} target="_blank" rel="noopener noreferrer">
              {uiText("Open {provider}", { provider: providerNames[provider] })} <ExternalLink />
            </a>
          </Button>
        )}
        <Button disabled={pending} onClick={onTest}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {uiText("I've sent the test message")}
        </Button>
      </div>
    </div>
  );
}
