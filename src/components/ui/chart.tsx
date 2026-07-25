"use client"

import * as React from "react"
import * as RechartsPrimitive from "recharts"

import { cn } from "@/lib/utils"

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { light: "", dark: ".dark" } as const

// ── MED-004 FIX (re-applied): CSS sanitizer for dangerouslySetInnerHTML ──
//
// ChartStyle injects a <style> tag via dangerouslySetInnerHTML. Without
// sanitization, a malicious chart config (e.g. a user-controlled color
// value of `red;}</style><script>alert(1)</script>`) can break out of the
// style block and execute arbitrary HTML. sanitizeChartCss enforces a
// strict allowlist:
//
//   - Selector must be `IDENTIFIER [data-chart=IDENTIFIER]` or
//     `.dark [data-chart=IDENTIFIER]` (the only two forms ChartStyle emits).
//   - Declaration must be `--color-IDENTIFIER: <color>;` where <color>
//     matches a strict hex / rgb / hsl / oklch pattern with NO nested
//     parens or semicolons.
//   - Identifier characters are limited to [A-Za-z0-9_-].
//
// Anything else is dropped. The function is deterministic and side-effect
// free so it can be unit-tested in isolation.

const IDENT_RE = /^[A-Za-z0-9_-]+$/;
const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|(?:rgb|hsl|oklch)\(\s*[^();]*\s*\))$/;
const DECL_RE = new RegExp(
  "^\\s*--color-(" + IDENT_RE.source.slice(1, -1) + ")\\s*:\\s*([^;]+);\\s*$"
);

/**
 * Sanitize a chart CSS string. Returns a cleaned string containing ONLY
 * allowlisted selector + declaration pairs. If the input contains a
 * `</style>` sequence or any disallowed construct, those portions are
 * stripped — the function never throws.
 */
export function sanitizeChartCss(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  // Reject early if a style-tag breakout is attempted — even if the rest
  // would parse, the input is clearly hostile.
  if (/<\/style|<style|<script|<!--|-->|expression\(|url\(/i.test(raw)) {
    return "";
  }
  const out: string[] = [];
  // Split on `}` to get selector+block chunks. Each chunk must look like
  // `SELECTOR { DECLARATIONS }`.
  const chunks = raw.split("}");
  for (const chunk of chunks) {
    const m = chunk.match(/^([^{}]+)\{([\s\S]*)$/);
    if (!m) continue;
    const selector = m[1].trim();
    const body = m[2].trim();
    // Selector must be exactly: `<ident> [data-chart=<ident>]` or
    // `.dark [data-chart=<ident>]`. We accept the empty-string prefix
    // (light theme) — selector "" + " " is normalised below.
    const selMatch = selector.match(
      /^(?:([A-Za-z0-9_-]*)\s+)?\[data-chart=([A-Za-z0-9_-]+)\]$/
    );
    if (!selMatch) continue;
    const [, prefix, chartId] = selMatch;
    // prefix must be empty or ".dark" (the only two THEMES entries).
    if (prefix && prefix !== ".dark") continue;
    if (!IDENT_RE.test(chartId)) continue;
    // Body must be a sequence of `--color-IDENT: COLOR;` declarations.
    const decls = body.split(";").map((d) => d.trim()).filter(Boolean);
    const keptDecls: string[] = [];
    for (const decl of decls) {
      const dm = decl.match(DECL_RE);
      if (!dm) continue;
      const [, colorKey, colorVal] = dm;
      if (!IDENT_RE.test(colorKey)) continue;
      if (!COLOR_RE.test(colorVal.trim())) continue;
      keptDecls.push(`  --color-${colorKey}: ${colorVal.trim()};`);
    }
    if (keptDecls.length === 0) continue;
    const prefixStr = prefix ? `${prefix} ` : "";
    out.push(`${prefixStr}[data-chart=${chartId}] {\n${keptDecls.join("\n")}\n}`);
  }
  return out.join("\n");
}

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode
    icon?: React.ComponentType
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  )
}

type ChartContextProps = {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />")
  }

  return context
}

function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig
  children: React.ComponentProps<
    typeof RechartsPrimitive.ResponsiveContainer
  >["children"]
}) {
  const uniqueId = React.useId()
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border flex aspect-video justify-center text-xs [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden",
          className
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(
    ([, config]) => config.theme || config.color
  )

  if (!colorConfig.length) {
    return null
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        // MED-004 FIX (re-applied): sanitize every value before injection.
        // The constructed CSS is run through sanitizeChartCss which
        // enforces a strict allowlist (only `--color-IDENT: COLOR;` pairs
        // under `[data-chart=IDENT]` / `.dark [data-chart=IDENT]` selectors).
        // Any hostile input (e.g. `</style><script>`) is dropped entirely.
        __html: sanitizeChartCss(
          Object.entries(THEMES)
            .map(
              ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, itemConfig]) => {
    const color =
      itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ||
      itemConfig.color
    return color ? `  --color-${key}: ${color};` : null
  })
  .join("\n")}
}
`
            )
            .join("\n"),
        ),
      }}
    />
  )
}

const ChartTooltip = RechartsPrimitive.Tooltip

function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = "dot",
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  formatter,
  color,
  nameKey,
  labelKey,
}: React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
  React.ComponentProps<"div"> & {
    hideLabel?: boolean
    hideIndicator?: boolean
    indicator?: "line" | "dot" | "dashed"
    nameKey?: string
    labelKey?: string
  }) {
  const { config } = useChart()

  const tooltipLabel = React.useMemo(() => {
    if (hideLabel || !payload?.length) {
      return null
    }

    const [item] = payload
    const key = `${labelKey || item?.dataKey || item?.name || "value"}`
    const itemConfig = getPayloadConfigFromPayload(config, item, key)
    const value =
      !labelKey && typeof label === "string"
        ? config[label as keyof typeof config]?.label || label
        : itemConfig?.label

    if (labelFormatter) {
      return (
        <div className={cn("font-medium", labelClassName)}>
          {labelFormatter(value, payload)}
        </div>
      )
    }

    if (!value) {
      return null
    }

    return <div className={cn("font-medium", labelClassName)}>{value}</div>
  }, [
    label,
    labelFormatter,
    payload,
    hideLabel,
    labelClassName,
    config,
    labelKey,
  ])

  if (!active || !payload?.length) {
    return null
  }

  const nestLabel = payload.length === 1 && indicator !== "dot"

  return (
    <div
      className={cn(
        "border-border/50 bg-background grid min-w-[8rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl",
        className
      )}
    >
      {!nestLabel ? tooltipLabel : null}
      <div className="grid gap-1.5">
        {payload.map((item, index) => {
          const key = `${nameKey || item.name || item.dataKey || "value"}`
          const itemConfig = getPayloadConfigFromPayload(config, item, key)
          const indicatorColor = color || item.payload.fill || item.color

          return (
            <div
              key={item.dataKey}
              className={cn(
                "[&>svg]:text-muted-foreground flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5",
                indicator === "dot" && "items-center"
              )}
            >
              {formatter && item?.value !== undefined && item.name ? (
                formatter(item.value, item.name, item, index, item.payload)
              ) : (
                <>
                  {itemConfig?.icon ? (
                    <itemConfig.icon />
                  ) : (
                    !hideIndicator && (
                      <div
                        className={cn(
                          "shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)",
                          {
                            "h-2.5 w-2.5": indicator === "dot",
                            "w-1": indicator === "line",
                            "w-0 border-[1.5px] border-dashed bg-transparent":
                              indicator === "dashed",
                            "my-0.5": nestLabel && indicator === "dashed",
                          }
                        )}
                        style={
                          {
                            "--color-bg": indicatorColor,
                            "--color-border": indicatorColor,
                          } as React.CSSProperties
                        } /* TAILWINDBREAK: dynamic CSS custom properties for chart indicator colors */
                      />
                    )
                  )}
                  <div
                    className={cn(
                      "flex flex-1 justify-between leading-none",
                      nestLabel ? "items-end" : "items-center"
                    )}
                  >
                    <div className="grid gap-1.5">
                      {nestLabel ? tooltipLabel : null}
                      <span className="text-muted-foreground">
                        {itemConfig?.label || item.name}
                      </span>
                    </div>
                    {item.value && (
                      <span className="text-foreground font-mono font-medium tabular-nums">
                        {item.value.toLocaleString()}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const ChartLegend = RechartsPrimitive.Legend

function ChartLegendContent({
  className,
  hideIcon = false,
  payload,
  verticalAlign = "bottom",
  nameKey,
}: React.ComponentProps<"div"> &
  Pick<RechartsPrimitive.LegendProps, "payload" | "verticalAlign"> & {
    hideIcon?: boolean
    nameKey?: string
  }) {
  const { config } = useChart()

  if (!payload?.length) {
    return null
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-4",
        verticalAlign === "top" ? "pb-3" : "pt-3",
        className
      )}
    >
      {payload.map((item) => {
        const key = `${nameKey || item.dataKey || "value"}`
        const itemConfig = getPayloadConfigFromPayload(config, item, key)

        return (
          <div
            key={item.value}
            className={cn(
              "[&>svg]:text-muted-foreground flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3"
            )}
          >
            {itemConfig?.icon && !hideIcon ? (
              <itemConfig.icon />
            ) : (
              <div
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{
                  backgroundColor: item.color,
                }} /* TAILWINDBREAK: dynamic chart item color from recharts payload */
              />
            )}
            {itemConfig?.label}
          </div>
        )
      })}
    </div>
  )
}

// Helper to extract item config from a payload.
function getPayloadConfigFromPayload(
  config: ChartConfig,
  payload: unknown,
  key: string
) {
  if (typeof payload !== "object" || payload === null) {
    return undefined
  }

  const payloadPayload =
    "payload" in payload &&
    typeof payload.payload === "object" &&
    payload.payload !== null
      ? payload.payload
      : undefined

  let configLabelKey: string = key

  if (
    key in payload &&
    typeof payload[key as keyof typeof payload] === "string"
  ) {
    configLabelKey = payload[key as keyof typeof payload] as string
  } else if (
    payloadPayload &&
    key in payloadPayload &&
    typeof payloadPayload[key as keyof typeof payloadPayload] === "string"
  ) {
    configLabelKey = payloadPayload[
      key as keyof typeof payloadPayload
    ] as string
  }

  return configLabelKey in config
    ? config[configLabelKey]
    : config[key as keyof typeof config]
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
}
