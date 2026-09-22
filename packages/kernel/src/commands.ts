/**
 * Command registration (kernel responsibility).
 *
 * The CLI and SDK call the same services — commands registered here are the
 * shared implementation surface (TypeScript standard, spec section 64).
 */
export interface CommandContext {
  readonly args: readonly string[];
  readonly flags: Readonly<Record<string, string | boolean>>;
  readonly json: boolean;
}

export interface CommandResult {
  /** Machine-readable payload; rendered as JSON with --json, else summarized. */
  readonly data: unknown;
  /** Human-readable rendering when not running with --json. */
  readonly text?: string;
  readonly exitCode?: number;
}

export interface CommandDefinition {
  readonly name: string;
  readonly description: string;
  /** Supports --json for deterministic output (spec section 97). */
  readonly supportsJson: boolean;
  /** Supports --headless (spec section 97). */
  readonly supportsHeadless: boolean;
  run(ctx: CommandContext): Promise<CommandResult> | CommandResult;
}

export class CommandRegistry {
  private readonly commands = new Map<string, CommandDefinition>();

  register(definition: CommandDefinition): void {
    if (this.commands.has(definition.name)) {
      throw new Error(`Command already registered: ${definition.name}`);
    }
    this.commands.set(definition.name, definition);
  }

  get(name: string): CommandDefinition | undefined {
    return this.commands.get(name);
  }

  list(): readonly CommandDefinition[] {
    return [...this.commands.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}
