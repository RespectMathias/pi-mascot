import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

type HeaderFactory = (tui: { requestRender(force?: boolean): void }) => {
  render(width: number): string[];
  invalidate?: () => void;
};

type MockExtensionContext = {
  hasUI: boolean;
  model?: { id: string };
  ui: {
    setHeader: Mock<(header: HeaderFactory | undefined) => void>;
    notify: Mock<(message: string, level: string) => void>;
  };
};

type CommandHandler = (
  args: string[],
  ctx: MockExtensionContext,
) => Promise<void> | void;

type CommandDefinition = {
  description: string;
  handler: CommandHandler;
};

type EventHandler = (...args: unknown[]) => void;

type MockPi = {
  on: Mock<(eventName: string, handler: EventHandler) => void>;
  registerCommand: Mock<
    (commandName: string, command: CommandDefinition) => void
  >;
};

const ANSI_PATTERN =
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

function withoutAnsi(text: string) {
  return text.replace(ANSI_PATTERN, "");
}

async function loadExtension() {
  const module = await import("../src/index.js");
  return module.default;
}

function createMockPi(): MockPi {
  return {
    on: vi.fn<(eventName: string, handler: EventHandler) => void>(),
    registerCommand:
      vi.fn<(commandName: string, command: CommandDefinition) => void>(),
  };
}

function createMockContext(modelId = "openai/gpt-5.5"): MockExtensionContext {
  return {
    hasUI: true,
    model: { id: modelId },
    ui: {
      setHeader: vi.fn<(header: HeaderFactory | undefined) => void>(),
      notify: vi.fn<(message: string, level: string) => void>(),
    },
  };
}

function getEventHandler(pi: MockPi, eventName: string) {
  const call = pi.on.mock.calls.find(
    ([registeredEventName]: [string, EventHandler]) =>
      registeredEventName === eventName,
  );

  if (!call) throw new Error(`Missing event handler: ${eventName}`);

  return call[1];
}

function getCommand(pi: MockPi, commandName: string) {
  const call = pi.registerCommand.mock.calls.find(
    ([registeredCommandName]: [string, CommandDefinition]) =>
      registeredCommandName === commandName,
  );

  if (!call) throw new Error(`Missing command: ${commandName}`);

  return call[1];
}

describe("flow-title extension", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("installs the cutout pi header on session start", async () => {
    const installExtension = await loadExtension();
    const pi = createMockPi();
    const ctx = createMockContext("anthropic/claude-sonnet");

    installExtension(pi as never);

    getEventHandler(pi, "session_start")({}, ctx);

    expect(ctx.ui.setHeader).toHaveBeenCalledOnce();

    const headerFactory = ctx.ui.setHeader.mock.calls[0]![0]!;
    const tui = { requestRender: vi.fn() };
    const header = headerFactory(tui);
    const output = withoutAnsi(header.render(80).join("\n"));

    expect(output).toContain("██████  ████  ██████");
    expect(output).toContain("██████████████████████████");
    expect(output).toContain("████      ████");
    expect(output).toContain("anthropic/claude-sonnet");
  });

  it("does not install the header when there is no UI", async () => {
    const installExtension = await loadExtension();
    const pi = createMockPi();
    const ctx = createMockContext();

    ctx.hasUI = false;

    installExtension(pi as never);

    getEventHandler(pi, "session_start")({}, ctx);

    expect(ctx.ui.setHeader).not.toHaveBeenCalled();
  });

  it("updates the rendered model id after model selection", async () => {
    const installExtension = await loadExtension();
    const pi = createMockPi();
    const ctx = createMockContext("initial-model");

    installExtension(pi as never);

    getEventHandler(pi, "session_start")({}, ctx);

    const headerFactory = ctx.ui.setHeader.mock.calls[0]![0]!;
    const tui = { requestRender: vi.fn() };
    const header = headerFactory(tui);

    getEventHandler(pi, "model_select")({ model: { id: "new-model" } });

    const output = withoutAnsi(header.render(80).join("\n"));

    expect(tui.requestRender).toHaveBeenCalledOnce();
    expect(output).toContain("new-model");
    expect(output).not.toContain("initial-model");
  });

  it("removes the header on session shutdown", async () => {
    const installExtension = await loadExtension();
    const pi = createMockPi();
    const ctx = createMockContext();

    installExtension(pi as never);

    getEventHandler(pi, "session_shutdown")({}, ctx);

    expect(ctx.ui.setHeader).toHaveBeenCalledWith(undefined);
  });

  it("reinstalls the header through the flow-title command", async () => {
    const installExtension = await loadExtension();
    const pi = createMockPi();
    const ctx = createMockContext();

    installExtension(pi as never);

    await getCommand(pi, "flow-title").handler([], ctx);

    expect(ctx.ui.setHeader).toHaveBeenCalledOnce();
    expect(ctx.ui.notify).toHaveBeenCalledWith("Flow title enabled", "info");
  });

  it("restores the built-in header through the flow-title-builtin command", async () => {
    const installExtension = await loadExtension();
    const pi = createMockPi();
    const ctx = createMockContext();

    installExtension(pi as never);

    await getCommand(pi, "flow-title-builtin").handler([], ctx);

    expect(ctx.ui.setHeader).toHaveBeenCalledWith(undefined);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "Built-in header restored",
      "info",
    );
  });
});
