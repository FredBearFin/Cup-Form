"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function ScoreTrendChart({
  data,
}: {
  data: { date: string; score: number; label: string }[];
}) {
  if (data.length < 2) {
    return (
      <p className="text-sm text-neutral-500">
        Log at least two cuppings to see a trend line.
      </p>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} domain={["auto", "auto"]} />
          <Tooltip
            formatter={(value) => Number(value).toFixed(2)}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.label}
          />
          <Line type="monotone" dataKey="score" stroke="#6f4e37" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
