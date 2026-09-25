export * from "./client.js";
export * from "./define-plugin.js";
export * from "./conventions.js";
export * from "./simple-yaml.js";
export * from "./research.js";
export * from "./install.js";
export * from "./stages.js";
export * from "./questionnaire.js";
export * from "./check.js";

// Re-export the full contract + kernel surface so plugin authors depend on
// this single package (the documented dependency of the plugin template).
export * from "@proagents/contracts";
export {
  KernelEventBus,
  LifecycleStateMachine,
  LIFECYCLE_STATES,
  PermissionFramework,
  HeadlessApprovalFlow,
  PluginLoader,
  ServiceRegistry,
  StructuredLogger,
  Workspace,
  CheckpointRunner,
  orderCheckpoints,
  WorkspaceLifecycleRunner,
  composeFlow,
  defaultFlow,
  spliceContributions,
  CANONICAL_PHASES,
} from "@proagents/kernel";
export type {
  ApprovalFlow,
  ApprovalRequest,
  ApprovalDecision,
  CommandContext,
  CommandDefinition,
  CommandResult,
  CommandRegistry,
  DoctorEntry,
  DiscoveredFactory,
  Logger,
  LogSink,
  PermissionCategory,
  PermissionRequest,
  PluginContext,
  WorkspacePlugin,
  WorkspaceOptions,
} from "@proagents/kernel";
export type { WorkspaceEventMap, WorkspaceEventName } from "@proagents/contracts";
