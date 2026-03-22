"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
  type ChartOptions,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler);

const baseOptions: ChartOptions<"line"> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: true, position: "top", labels: { boxWidth: 10, boxHeight: 10 } },
    tooltip: { enabled: true, intersect: false, mode: "index" },
  },
  interaction: { intersect: false, mode: "index" },
  scales: {
    x: { grid: { display: false }, ticks: { color: "#64748b" } },
    y: { grid: { color: "rgba(148,163,184,0.25)" }, ticks: { color: "#64748b" } },
  },
};

export function LineChart(props: { data: any; height?: number }) {
  return (
    <div style={{ height: props.height ?? 260 }}>
      <Line data={props.data} options={baseOptions} />
    </div>
  );
}

export function BarChart(props: { data: any; height?: number; stacked?: boolean }) {
  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: "top", labels: { boxWidth: 10, boxHeight: 10 } },
      tooltip: { enabled: true },
    },
    scales: {
      x: { stacked: !!props.stacked, grid: { display: false }, ticks: { color: "#64748b" } },
      y: { stacked: !!props.stacked, grid: { color: "rgba(148,163,184,0.25)" }, ticks: { color: "#64748b" } },
    },
  };
  return (
    <div style={{ height: props.height ?? 260 }}>
      <Bar data={props.data} options={options} />
    </div>
  );
}

