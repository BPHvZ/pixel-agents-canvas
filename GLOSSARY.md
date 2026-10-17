# Pixel Agents Office

This context models real coding-agent sessions and their observable activity as a read-only office dashboard.

## Language

**Provider**:
A coding-agent product or runtime that exposes session or agent activity to the dashboard, such as GitHub Copilot CLI or OpenAI Codex CLI.
_Avoid_: Integration (when referring to the product/runtime itself)

**Host**:
The application that runs or presents a session, such as VS Code or the GitHub Copilot App.
_Avoid_: Provider

**Harness**:
The agent runtime that owns a session and emits its activity signals, such as Copilot CLI or Codex CLI. A harness remains the session's activity source even when requests are routed to another model provider.
_Avoid_: Model provider

**Model route**:
The model provider and endpoint that receive inference requests for a session, such as GitHub-hosted models, an OpenAI-compatible proxy, or a local model.
_Avoid_: Harness, activity source

**Billing route**:
The account, plan, subscription, or key charged for model use, such as GitHub Copilot credits, ChatGPT/Codex access, or a provider API key.
_Avoid_: Model route

**Activity source**:
The harness or provider-owned interface that emits observable lifecycle events for a session. It determines what the office can truthfully report, independently from the model route.
_Avoid_: Model provider

**Session**:
A provider-owned conversation or work context in which an agent performs a coding task.
_Avoid_: Character, agent (when referring to the whole conversation)

**Agent**:
A distinct provider-identified worker participating in a session; a session may contain a top-level agent and zero or more separately identified subagents.
_Avoid_: Session (when referring to an individual worker)

**Subagent**:
An agent that a provider explicitly relates to a parent agent or session as delegated or parallel work.
_Avoid_: Inferred worker

**Activity**:
A provider-observed lifecycle or work signal associated with a session or agent, including working, waiting, blocked, paused, or terminal states when exposed.
_Avoid_: Simulated event

**Task summary**:
A concise, sanitized description of a session's task, sourced from provider metadata by default or from explicitly consented transient prompt summarization where supported.
_Avoid_: Transcript, prompt excerpt

**Provider title**:
A provider-supplied session name or title; it may contain user content and is not inherently a sanitized task summary.
_Avoid_: Safe summary, prompt excerpt

**Discovery source**:
The provider and host interface through which a session or agent becomes observable to the dashboard.
_Avoid_: Coverage (when referring to the mechanism rather than its extent)

**Session cluster**:
A room or desk grouping that visually represents provider-established relationships among agents in one session; it does not imply shared files or workspace.
_Avoid_: Team room (unless the provider reports a team)

**Preview activity**:
Explicitly labeled illustrative/sample data that is never presented as real provider activity.
_Avoid_: Live, connected (for sample data)

**Decorative dialogue**:
Fictional, authored character text shown as a speech bubble and explicitly labeled as persona flavor, not as actual agent output or provider activity.
_Avoid_: Agent response, activity message

**Character flavor**:
A stable fictional style for decorative dialogue, not a provider-reported role, personality, capability, or task knowledge.
_Avoid_: Agent role, provider persona

**Office vignette**:
A staged fictional scene involving office characters, independent of observed work and not evidence of provider-reported collaboration.
_Avoid_: Activity event, collaboration event

**Office prop**:
A decorative object created by an office vignette that remains in the open office until an idle character visibly tidies it, a new agent tidies its own desk on arrival, or the office closes; it is not a task artifact or provider data.
_Avoid_: Task artifact, session content

**Desk setup**:
A one-time fictional arrival action in which a new agent tidies its own dirty desk, shown separately from the provider-reported activity state.
_Avoid_: Provider status, activity event

**Abandoned cluster**:
A session cluster with no remaining agents after explicit provider-reported session closure; it is distinct from a stale or disconnected cluster.
_Avoid_: Stale session, disconnected session

**Scene motif**:
One or more decorative visual cues selected from a provider title to suggest broad themes; they do not establish the session's actual project, technology, or work.
_Avoid_: Task evidence, provider metadata
