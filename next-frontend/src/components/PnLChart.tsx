"use client";

import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

type ZoomLevel = "1M" | "6M" | "YTD" | "ALL";

interface PnLChartProps {
  data: {
    pnl: number;
    close_date: string;
    symbol?: string;
  }[];
}

const PnLChart: React.FC<PnLChartProps> = ({ data }) => {
  const d3Container = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("ALL");

  useEffect(() => {
    if (data && d3Container.current) {
      const now = new Date();
      const filteredData = data.filter((d) => {
        const date = new Date(d.close_date);
        switch (zoomLevel) {
          case "1M":
            return date >= d3.timeMonth.offset(now, -1);
          case "6M":
            return date >= d3.timeMonth.offset(now, -6);
          case "YTD":
            return date.getFullYear() === now.getFullYear();
          case "ALL":
          default:
            return true;
        }
      });

      const svg = d3.select(d3Container.current);
      svg.selectAll("*").remove();

      const containerWidth = d3Container.current.clientWidth;
      const margin = { top: 20, right: 30, bottom: 40, left: 60 };
      const width = containerWidth - margin.left - margin.right;
      const height = 350 - margin.top - margin.bottom;

      const chart = svg
        .attr("width", containerWidth)
        .attr("height", 350)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

      // Add background
      chart
        .append("rect")
        .attr("width", width)
        .attr("height", height)
        .attr("fill", "#1a1a1a")
        .attr("rx", 4);

      const x = d3
        .scaleBand()
        .range([0, width])
        .domain(filteredData.map((d, i) => i.toString()))
        .padding(0.15);

      const yMin = d3.min(filteredData, (d) => d.pnl) ?? 0;
      const yMax = d3.max(filteredData, (d) => d.pnl) ?? 0;
      const yPadding = Math.abs(yMax - yMin) * 0.1;

      const y = d3
        .scaleLinear()
        .domain([yMin - yPadding, yMax + yPadding])
        .range([height, 0]);

      // Add horizontal grid lines
      chart
        .append("g")
        .attr("class", "grid")
        .call(
          d3
            .axisLeft(y)
            .tickSize(-width)
            .tickFormat(() => "")
        )
        .style("stroke", "#2a2a2a")
        .style("stroke-opacity", 0.5)
        .style("stroke-dasharray", "2,2");

      // Add zero line
      if (yMin < 0 && yMax > 0) {
        chart
          .append("line")
          .attr("x1", 0)
          .attr("x2", width)
          .attr("y1", y(0))
          .attr("y2", y(0))
          .attr("stroke", "#6b6b6b")
          .attr("stroke-width", 1.5)
          .attr("stroke-dasharray", "4,4");
      }

      // X axis
      chart
        .append("g")
        .attr("transform", `translate(0,${height})`)
        .call(
          d3
            .axisBottom(x)
            .tickFormat(() => "")
            .tickSize(0)
        )
        .style("color", "#6b6b6b");

      // Y axis
      chart
        .append("g")
        .call(
          d3
            .axisLeft(y)
            .ticks(6)
            .tickFormat((d) => `$${d3.format(".0f")(d as number)}`)
        )
        .style("color", "#a0a0a0")
        .style("font-size", "12px");

      // Create tooltip
      const tooltip = d3.select(tooltipRef.current);

      // Bars with hover effects
      chart
        .selectAll(".bar")
        .data(filteredData)
        .enter()
        .append("rect")
        .attr("class", "bar")
        .attr("x", (d, i) => x(i.toString()) || 0)
        .attr("y", (d) => y(Math.max(0, d.pnl)))
        .attr("width", x.bandwidth())
        .attr("height", (d) => Math.abs(y(d.pnl) - y(0)))
        .attr("fill", (d) => (d.pnl >= 0 ? "#10b981" : "#ef4444"))
        .attr("rx", 2)
        .style("opacity", 0.85)
        .style("transition", "all 0.2s ease")
        .on("mouseover", function (event, d) {
          d3.select(this)
            .style("opacity", 1)
            .attr("stroke", d.pnl >= 0 ? "#34d399" : "#f87171")
            .attr("stroke-width", 2);

          tooltip
            .style("opacity", 1)
            .style("display", "block")
            .html(
              `
              <div class="font-semibold mb-1">${new Date(
                d.close_date
              ).toLocaleDateString()}</div>
              <div class="text-sm ${
                d.pnl >= 0 ? "text-green-400" : "text-red-400"
              }">
                P/L: $${d.pnl.toFixed(2)}
              </div>
            `
            )
            .style("left", `${event.pageX + 10}px`)
            .style("top", `${event.pageY - 10}px`);
        })
        .on("mouseout", function () {
          d3.select(this).style("opacity", 0.85).attr("stroke", "none");
          tooltip.style("opacity", 0).style("display", "none");
        });
    }
  }, [data, zoomLevel]);

  return (
    <div className="relative">
      <svg ref={d3Container} style={{ width: "100%", height: "350px" }} />
      <div
        ref={tooltipRef}
        className="absolute pointer-events-none bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm shadow-lg opacity-0"
        style={{ display: "none" }}
      />
      <div className="flex items-center justify-center gap-2 mt-4">
        {(["1M", "6M", "YTD", "ALL"] as ZoomLevel[]).map((level) => (
          <button
            key={level}
            onClick={() => setZoomLevel(level)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              zoomLevel === level
                ? "bg-primary text-white shadow-md"
                : "bg-bg-elevated text-text-secondary hover:bg-bg-surface hover:text-text-primary border border-border-default"
            }`}
          >
            {level}
          </button>
        ))}
      </div>
    </div>
  );
};

export default PnLChart;
