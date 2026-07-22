"use client";

/**
 * FinOps Charts — Client component wrapping Recharts for the FinOps Dashboard.
 *
 * Server component passes serialised data; this component renders:
 *   1. Revenue vs Cost bar chart (daily)
 *   2. Cascade breakdown horizontal bar
 *   3. Profit trend line chart
 */

import {
  Bar,
  BarChart,
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";

// ─── Types (serialisable, received from server component) ──────────────────

export interface DailyPnLPoint {
  date: string;
  revenue: number;
  aiCost: number;
  infraCost: number;
  profit: number;
}

export interface CascadeSlice {
  stage: string;
  count: number;
  pct: number;
  fill: string;
}

export interface CostTrendPoint {
  date: string;
  aiCost: number;
  savedCost: number;
}

// ─── Chart configs ────────────────────────────────────────────────────────

const pnlConfig: ChartConfig = {
  revenue: { label: "Revenue", color: "hsl(142, 76%, 36%)" },
  aiCost: { label: "AI Cost", color: "hsl(0, 84%, 60%)" },
  infraCost: { label: "Infra Cost", color: "hsl(38, 92%, 50%)" },
  profit: { label: "Profit", color: "hsl(221, 83%, 53%)" },
};

const cascadeConfig: ChartConfig = {
  cache: { label: "Cache", color: "hsl(142, 76%, 36%)" },
  pattern: { label: "Pattern", color: "hsl(199, 89%, 48%)" },
  rule: { label: "Rule", color: "hsl(38, 92%, 50%)" },
  memory: { label: "Memory", color: "hsl(262, 83%, 58%)" },
  ai: { label: "LLM", color: "hsl(0, 84%, 60%)" },
};

const costTrendConfig: ChartConfig = {
  aiCost: { label: "AI Cost ($)", color: "hsl(0, 84%, 60%)" },
  savedCost: { label: "AI Saved ($)", color: "hsl(142, 76%, 36%)" },
};

// ─── Sub-components ───────────────────────────────────────────────────────

export function RevenueCostChart({ data }: { data: DailyPnLPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        No snapshot data for chart
      </div>
    );
  }
  return (
    <ChartContainer config={pnlConfig} className="h-64 w-full">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={11} />
        <YAxis tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v: number) => `$${v}`} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="aiCost" fill="var(--color-aiCost)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="infraCost" fill="var(--color-infraCost)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="profit" fill="var(--color-profit)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

export function CascadeBreakdownChart({ data }: { data: CascadeSlice[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        No cascade data
      </div>
    );
  }

  const pieData = data.map((d) => ({
    name: d.stage,
    value: d.count,
    fill: d.fill,
  }));

  return (
    <ChartContainer config={cascadeConfig} className="h-56 w-full">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
        <Pie
          data={pieData}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={2}
        >
          {pieData.map((entry, index) => (
            <Cell key={index} fill={entry.fill} />
          ))}
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="name" />} />
      </PieChart>
    </ChartContainer>
  );
}

export function CostTrendChart({ data }: { data: CostTrendPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        No cost trend data
      </div>
    );
  }
  return (
    <ChartContainer config={costTrendConfig} className="h-56 w-full">
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={11} />
        <YAxis tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v: number) => `$${v}`} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Line type="monotone" dataKey="aiCost" stroke="var(--color-aiCost)" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="savedCost" stroke="var(--color-savedCost)" strokeWidth={2} dot={false} />
      </LineChart>
    </ChartContainer>
  );
}