export interface ToolCall {
  name: string;
  args?: Record<string, unknown>;
}

export interface PreToolUsePayload {
  toolCall?: ToolCall;
  stepIdx?: number;
  conversationId?: string;
  workspacePaths?: string[];
  artifactDirectoryPath?: string;
  transcriptPath?: string;
  modelName?: string;
  preToolHookArgs?: {
    toolCall?: ToolCall;
    tool_name?: string;
    tool_input?: unknown;
  };
  toolHookArgs?: {
    toolCall?: ToolCall;
    tool_name?: string;
    tool_input?: unknown;
  };
  tool_name?: string;
  tool_input?: unknown;
}

export interface PostToolUsePayload {
  toolCall?: ToolCall;
  stepIdx?: number;
  error?: string;
  conversationId?: string;
  workspacePaths?: string[];
  artifactDirectoryPath?: string;
  transcriptPath?: string;
  modelName?: string;
}

export interface StopPayload {
  executionNum?: number;
  terminationReason?: string;
  error?: string;
  fullyIdle?: boolean;
  conversationId?: string;
  workspacePaths?: string[];
  artifactDirectoryPath?: string;
  transcriptPath?: string;
  modelName?: string;
}

export interface HeartbeatPayload {
  entity: string;
  projectFolder: string;
  isWrite: boolean;
}

export interface ProjectState {
  lastHeartbeatAt: number;
  pendingChanges: Record<string, { isWrite: boolean; timestamp: number }>;
}
