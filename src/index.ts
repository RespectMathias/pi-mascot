import path from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

type Rgb = [number, number, number];
type Renderable = {
  render(width: number): string[];
  invalidate?: () => void;
};
type RenderableContainer = Renderable & { children: Renderable[] };
type TuiLike = RenderableContainer & { requestRender(force?: boolean): void };

const HIGHLIGHT: Rgb = [255, 255, 255];
const LIGHT: Rgb = [220, 220, 226];
const MID: Rgb = [150, 150, 160];
const SHADOW: Rgb = [90, 90, 102];
const DEEP_SHADOW: Rgb = [45, 45, 55];

const ANSI_PATTERN =
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

const TITLE_LINES = [
  "   ████████████████████   ",
  "   ██████  ████  ██████   ",
  "   ██████  ████  ██████   ",
  "██████████████████████████",
  "      ████      ████      ",
  "      ████      ████      ",
  "      ████      ████      ",
  "     ▄████      ████▄     ",
  "    ▀▀▀▀          ▀▀▀▀    ",
];

function fg([r, g, b]: Rgb, text: string) {
  return `\x1b[38;2;${r};${g};${b}m${text}${RESET}`;
}

function layerForRow(row: number) {
  if (row <= 2) return "head";
  if (row === 3) return "mouth";
  if (row <= 6) return "legs";
  return "feet";
}

function shadeForPosition(column: number, row: number, width: number): Rgb {
  const x = width <= 1 ? 0 : column / (width - 1);
  const centerDistance = Math.abs(x - 0.5);

  const isOuterEdge = centerDistance > 0.4;
  const isEdge = centerDistance > 0.28;
  const isInner = centerDistance < 0.16;

  const layer = layerForRow(row);

  if (layer === "head") {
    if (row === 0) {
      if (isOuterEdge) return MID;
      if (isEdge) return LIGHT;
      return HIGHLIGHT;
    }

    if (row === 1) {
      if (isOuterEdge) return SHADOW;
      if (isEdge) return MID;
      return LIGHT;
    }

    if (isOuterEdge) return MID;
    if (isEdge) return LIGHT;
    return LIGHT;
  }

  if (layer === "mouth") {
    if (isOuterEdge) return DEEP_SHADOW;
    if (isEdge) return SHADOW;
    if (isInner) return MID;
    return SHADOW;
  }

  if (layer === "legs") {
    if (isOuterEdge) return SHADOW;
    if (isEdge) return MID;
    if (isInner) return LIGHT;
    return MID;
  }

  if (row === 7) {
    if (isOuterEdge) return DEEP_SHADOW;
    if (isEdge) return SHADOW;
    if (isInner) return MID;
    return SHADOW;
  }

  if (isOuterEdge) return DEEP_SHADOW;
  if (isEdge) return SHADOW;
  return MID;
}

function shadedText(text: string, row = 0) {
  const chars = [...text];
  const width = Math.max(chars.length, 1);

  return chars
    .map((char, column) => {
      if (char === " ") return char;
      return fg(shadeForPosition(column, row, width), char);
    })
    .join("");
}

function center(text: string, width: number) {
  const length = [...text].length;
  if (length >= width) return text;

  return `${" ".repeat(Math.floor((width - length) / 2))}${text}`;
}

function projectName() {
  return path.basename(process.cwd()) || "session";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRenderable(value: unknown): value is Renderable {
  return isRecord(value) && typeof value.render === "function";
}

function isRenderableContainer(value: unknown): value is RenderableContainer {
  if (!isRenderable(value)) return false;

  const candidate = value as Renderable & { children?: unknown };
  return Array.isArray(candidate.children);
}

function withoutAnsi(text: string) {
  return text.replace(ANSI_PATTERN, "");
}

function renderedText(component: Renderable) {
  try {
    return withoutAnsi(component.render(120).join("\n"));
  } catch {
    return "";
  }
}

function hasSectionHeader(text: string, header: string) {
  return text.split("\n").some((line) => line.trim() === header);
}

function isHiddenStartupListing(component: Renderable) {
  const text = renderedText(component);
  const isThemesListing =
    hasSectionHeader(text, "[Themes]") &&
    (text.includes("/themes/") || text.includes(".pi/agent/themes"));
  const isExtensionsListing =
    hasSectionHeader(text, "[Extensions]") &&
    (text.includes("/extensions/") || text.includes(".pi/agent/extensions"));

  return isThemesListing || isExtensionsListing;
}

function isBlankSpacer(component: Renderable) {
  return renderedText(component).trim() === "";
}

function renderHeader(width: number, subtitleText: string) {
  const lines = TITLE_LINES.map((line, row) =>
    shadedText(center(line, width), row),
  );
  const subtitle = center(subtitleText, width);

  return [
    "",
    ...lines,
    `${BOLD}${shadedText(subtitle, TITLE_LINES.length + 1)}${RESET}`,
    "",
  ];
}

export default function (pi: ExtensionAPI) {
  let requestRender: (() => void) | undefined;
  let currentModelId = "no model selected";

  function installHeader(ctx: ExtensionContext) {
    ctx.ui.setHeader((tui) => {
      requestRender = () => tui.requestRender();

      return {
        render(width: number) {
          return renderHeader(width, `${currentModelId} · ${projectName()}`);
        },
        invalidate() {
          tui.requestRender();
        },
      };
    });
  }

  pi.on("session_start", (_event, ctx) => {
    currentModelId = ctx.model?.id ?? "no model selected";

    if (!ctx.hasUI) return;

    installHeader(ctx);
  });

  pi.on("model_select", (event) => {
    currentModelId = event.model.id;
    requestRender?.();
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (ctx.hasUI) ctx.ui.setHeader(undefined);
  });

  pi.registerCommand("flow-title", {
    description: "Enable the shaded monochrome session header",
    handler: async (_args, ctx) => {
      installHeader(ctx);
      ctx.ui.notify("Flow title enabled", "info");
    },
  });

  pi.registerCommand("flow-title-builtin", {
    description: "Restore pi's built-in header for this session",
    handler: async (_args, ctx) => {
      ctx.ui.setHeader(undefined);
      ctx.ui.notify("Built-in header restored", "info");
    },
  });
}
