# Sharing a personal authorization between companies

A source company can issue an MCP gateway capability for one existing personal
connection grant. The target company connects to that gateway as an ordinary
remote MCP app and independently selects its allowed tools. OAuth credentials
remain in the source vault and use the source connection's normal refresh path.

Gateway `authConfig.sharedAuthorization` contains `connectionId`, `grantId`, and
`targetCompanyId`. Creating or changing that reference requires the grant owner's
consent and tools administration permission in both companies. The server pins
`profileScopeHash` at consent time. Independent profile entry changes invalidate
the share until the owner renews consent through the gateway configuration.
Use a source
profile with default deny, explicit catalog or connection entries for only that
connection, and `defaultProfileMode: gateway_only`. The target's connector token
is stored in its vault; it can be independently revoked without revoking OAuth.

The server validates the grant, owner membership, source and target company,
connection, profile, and gateway token on every protocol request. It resolves the
exact referenced grant again before upstream dispatch. Revocation, disabled
connections, inactive companies or owners, and profile expansion fail closed.
The gateway token remains the audit actor; the grant owner is used only to resolve
credentials and is not substituted as the caller. Callers cannot set this identity
through tool arguments, headers, or generic metadata.

Orialis uses the Paperclip开发 GitHub gateway with 45 selected actions. The target
connector and the source gateway both retain their existing tool policy and
approval checks. This is an MCP authorization delegation; it does not replace
native shell Git authentication or automatically enable other source apps.
