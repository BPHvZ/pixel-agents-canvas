// Type-only projection of the runtime-injected SDK surface used by this extension.
// No SDK package is installed or shipped; the host remains the runtime authority.
declare module "@github/copilot-sdk/extension" {
    export class CanvasError extends Error {
        constructor(code: string, message: string);
    }

    export interface ObjectSchema {
        type: "object";
        properties: Record<string, unknown>;
        additionalProperties: false;
    }

    export interface CanvasAction {
        name: string;
        description: string;
        inputSchema: ObjectSchema;
        handler: () => unknown | Promise<unknown>;
    }

    export interface CanvasDefinition {
        id: string;
        displayName: string;
        description: string;
        actions: CanvasAction[];
        open: (context: { instanceId: string }) => Promise<{ title: string; status: string; url: string }>;
        onClose: (context: { instanceId: string }) => Promise<void>;
    }

    export interface SessionHooks {
        onSessionStart: () => void;
        onSessionEnd: () => void;
        onUserPromptSubmitted: () => void;
        onPreToolUse: () => void;
        onPostToolUse: () => void;
        onPostToolUseFailure: () => void;
        onErrorOccurred: () => void;
    }

    export interface ExtensionSession {
        on(event: "session.end", callback: () => void | Promise<void>): void;
    }

    export function createCanvas(definition: CanvasDefinition): CanvasDefinition;
    export function joinSession(options: { canvases: CanvasDefinition[]; hooks: SessionHooks }): Promise<ExtensionSession>;
}
