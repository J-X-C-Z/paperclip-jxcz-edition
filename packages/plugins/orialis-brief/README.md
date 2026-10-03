# Orialis task brief

Paperclip plugin with a company task brief and project detail entry. The main view answers three questions: what happened to the assigned tasks, whether the original requirements were met, and what the user needs to do personally.

## Current data boundary

`src/repository/task-brief.ts` is a reviewed, dated snapshot of eight Orialis work items. It separates task workflow stage from acceptance verdict and records requirements, evidence, gaps, agent next steps, sources, and concrete user actions. It is **not a live task feed or a newly generated Secretary report**. The UI displays the snapshot time and links to the original Secretary document in ORI-71, which may contain older task stages.

The snapshot is restricted to the verified Orialis company ID. Other companies show an empty state. Project tabs show an unbound state and link to the company brief instead of showing unrelated Orialis data. No task-to-Paperclip-project mapping is assumed.

## Layout and behavior

- User actions first, with device/deployment prerequisites and a button to expand the associated task.
- Task comparison: original requirement, current progress, and evidence-based acceptance verdict.
- Filters for all tasks, user actions, unmet requirements, or met requirements; text search and a recoverable no-results state.
- Expanded details include gaps, existing evidence, concrete steps and success criteria where needed, agent-owned next steps, and source records.
- Host theme tokens, responsive layout, semantic headings, keyboard focus and disclosure states.

The old preview fixtures remain under `src/repository/preview-data.ts` for reference but are not rendered in the main page. The UI no longer exposes synthetic example controls to end users.

## Build and view

From the active Paperclip checkout:

```sh
node_modules/.bin/tsc -p packages/plugins/orialis-brief/tsconfig.json
node packages/plugins/orialis-brief/scripts/build-ui.mjs
paperclipai plugin target --api-base "$PAPERCLIP_API_URL"
paperclipai plugin install --local /Users/jxcz/Agent\ Workspace/Paperclip/packages/plugins/orialis-brief
```

Set `PAPERCLIP_API_URL` to the intended live instance first. When already installed from this local path, rebuild and reload after the development server is healthy. Open `/ORI/brief` in the verified Orialis company.

Secretary assignments use the matching task/acceptance/action reporting contract. Updating their instructions does not automatically regenerate the archived report, create a schedule, or connect this page to live data.
