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

**Unknown activity state**:
A factual state used when the provider does not currently supply an interpretable status; it is not equivalent to idle, ended, or resumed work.
_Avoid_: Idle, abandoned

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

**Scenario**:
A named, repeatable set of illustrative inputs representing one or more supported user-visible situations for development review; it is not provider-observed activity.

**Decorative dialogue**:
Fictional, authored character text shown in a speech bubble and identified to assistive technology as fiction, not as agent output or provider activity.
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
A session cluster with no non-ended agents after explicit provider-reported session closure; ended characters may remain visible. It is distinct from a quiet cluster or stale/disconnected source.
_Avoid_: Quiet cluster, stale session

**Quiet cluster**:
A fictional office presentation used when no fresh working, waiting, or failed activity is observed, including when the source is disconnected; it does not assert that the provider reports the session idle or ended.
_Avoid_: Provider-idle session, abandoned cluster

**Off-duty character**:
A provider-identified character whose agent has explicitly ended but remains visible for decorative office activity while retaining its factual ended status.
_Avoid_: Active agent, resumed worker

**Scene motif**:
One or more decorative visual cues selected from a provider title to suggest broad themes; they do not establish the session's actual project, technology, or work.
_Avoid_: Task evidence, provider metadata

**Source release**:
A versioned snapshot of this repository made available to users; it does not by itself install or update the canvas.
_Avoid_: Canvas distribution

**Rolling release draft**:
An unpublished release draft that accumulates merged changes until it is manually published as one release.
_Avoid_: Per-merge published release

**Release batch**:
The changes accumulated in the rolling release draft since the last published release.
_Avoid_: Individual merge release

**Canvas distribution**:
A supported way to install or update the canvas; a GitHub source release is not a distribution channel.
_Avoid_: GitHub source release
