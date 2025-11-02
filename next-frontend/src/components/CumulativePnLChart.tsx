"use client";

import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

type ZoomLevel = "1M" | "6M" | "YTD" | "ALL";

interface CumulativePnLChartProps {
  data: {
    pnl: number;
    close_date: string;
  }[];
}

const CumulativePnLChart: React.FC<CumulativePnLChartProps> = ({ data }) => {
  const d3Container = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("ALL");

  useEffect(() => {
    if (data && data.length > 0 && d3Container.current) {
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

      // Sort data by close date and calculate cumulative P/L
      const sortedData = [...filteredData].sort(
        (a, b) =>
          new Date(a.close_date).getTime() - new Date(b.close_date).getTime()
      );
      let cumulativePnl = 0;
      const cumulativeData = sortedData.map((d) => {
        cumulativePnl += d.pnl;
        return {
          date: new Date(d.close_date),
          value: cumulativePnl,
          pnl: d.pnl,
        };
      });

      const x = d3
        .scaleTime()
        .domain(d3.extent(cumulativeData, (d) => d.date) as [Date, Date])
        .range([0, width]);

      const yMin = d3.min(cumulativeData, (d) => d.value) ?? 0;
      const yMax = d3.max(cumulativeData, (d) => d.value) ?? 0;
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

      // Add zero line if needed
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
        .call(d3.axisBottom(x).ticks(6))
        .style("color", "#a0a0a0")
        .style("font-size", "12px");

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

      // Add gradient for area
      const defs = svg.append("defs");
      const gradient = defs
        .append("linearGradient")
        .attr("id", "gradient-cumulative")
        .attr("x1", "0%")
        .attr("y1", "0%")
        .attr("x2", "0%")
        .attr("y2", "100%");

      gradient
        .append("stop")
        .attr("offset", "0%")
        .attr("stop-color", "#3b82f6")
        .attr("stop-opacity", 0.3);

      gradient
        .append("stop")
        .attr("offset", "100%")
        .attr("stop-color", "#3b82f6")
        .attr("stop-opacity", 0);

      // Add area fill under the line
      chart
        .append("path")
        .datum(cumulativeData)
        .attr("fill", "url(#gradient-cumulative)")
        .attr(
          "d",
          d3
            .area<{ date: Date; value: number }>()
            .x((d) => x(d.date))
            .y0(height)
            .y1((d) => y(d.value))
            .curve(d3.curveMonotoneX)
        );

      // Add the line
      chart
        .append("path")
        .datum(cumulativeData)
        .attr("fill", "none")
        .attr("stroke", "#60a5fa")
        .attr("stroke-width", 3)
        .attr(
          "d",
          d3
            .line<{ date: Date; value: number }>()
            .x((d) => x(d.date))
            .y((d) => y(d.value))
            .curve(d3.curveMonotoneX)
        );

      // Create tooltip
      const tooltip = d3.select(tooltipRef.current);

      // Create invisible overlay for mouse tracking
      const focus = chart.append("g").style("display", "none");

      // Crosshair lines
      focus
        .append("line")
        .attr("class", "x-hover-line")
        .attr("stroke", "#60a5fa")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "3,3");

      focus
        .append("line")
        .attr("class", "y-hover-line")
        .attr("stroke", "#60a5fa")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "3,3");

      // Circle marker
      focus
        .append("circle")
        .attr("r", 5)
        .attr("fill", "#60a5fa")
        .attr("stroke", "#1a1a1a")
        .attr("stroke-width", 2);

      // Overlay for mouse events
      chart
        .append("rect")
        .attr("width", width)
        .attr("height", height)
        .style("fill", "none")
        .style("pointer-events", "all")
        .on("mouseover", () => focus.style("display", null))
        .on("mouseout", () => {
          focus.style("display", "none");
          tooltip.style("opacity", 0).style("display", "none");
        })
        .on("mousemove", function (event) {
          const [mouseX] = d3.pointer(event);
          const x0 = x.invert(mouseX);
          const bisect = d3.bisector(
            (d: (typeof cumulativeData)[0]) => d.date
          ).left;
          const i = bisect(cumulativeData, x0, 1);
          const d0 = cumulativeData[i - 1];
          const d1 = cumulativeData[i];
          const d =
            d1 &&
            x0.getTime() - d0.date.getTime() > d1.date.getTime() - x0.getTime()
              ? d1
              : d0;

          if (d) {
            const xPos = x(d.date);
            const yPos = y(d.value);

            focus
              .select(".x-hover-line")
              .attr("x1", xPos)
              .attr("x2", xPos)
              .attr("y1", 0)
              .attr("y2", height);

            focus
              .select(".y-hover-line")
              .attr("x1", 0)
              .attr("x2", width)
              .attr("y1", yPos)
              .attr("y2", yPos);

            focus.select("circle").attr("cx", xPos).attr("cy", yPos);

            tooltip
              .style("opacity", 1)
              .style("display", "block")
              .html(
                `
                <div class="font-semibold mb-1">${d.date.toLocaleDateString()}</div>
                <div class="text-sm text-blue-400">
                  Cumulative: $${d.value.toFixed(2)}
                </div>
                <div class="text-xs text-gray-400 mt-1">
                  Trade P/L: ${d.pnl >= 0 ? "+" : ""}$${d.pnl.toFixed(2)}
                </div>
              `
              )
              .style("left", `${event.pageX + 10}px`)
              .style("top", `${event.pageY - 10}px`);
          }
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

export default CumulativePnLChart;
