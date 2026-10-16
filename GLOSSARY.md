# Pixel Agents Office

This context models real coding-agent sessions and their observable activity as a read-only office dashboard.

## Language

**Provider**:
A coding-agent product or runtime that exposes session or agent activity to the dashboard, such as GitHub Copilot or OpenAI Codex.
_Avoid_: Integration (when referring to the product/runtime itself)

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

**Discovery source**:
The provider and host interface through which a session or agent becomes observable to the dashboard.
_Avoid_: Coverage (when referring to the mechanism rather than its extent)

**Session cluster**:
A room or desk grouping that visually represents provider-established relationships among agents in one session; it does not imply shared files or workspace.
_Avoid_: Team room (unless the provider reports a team)

**Preview activity**:
Explicitly labeled illustrative/sample data that is never presented as real provider activity.
_Avoid_: Live, connected (for sample data)
