"use client";

import React, { useEffect, useRef } from "react";
import * as d3 from "d3";

interface PnLChartProps {
  data: { pnl: number }[];
}

const PnLChart: React.FC<PnLChartProps> = ({ data }) => {
  const d3Container = useRef(null);

  useEffect(() => {
    if (data && d3Container.current) {
      const svg = d3.select(d3Container.current);
      svg.selectAll("*").remove(); // Clear SVG before redrawing

      const margin = { top: 20, right: 30, bottom: 40, left: 50 };
      const width = 800 - margin.left - margin.right;
      const height = 400 - margin.top - margin.bottom;

      const chart = svg
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

      const x = d3
        .scaleBand()
        .range([0, width])
        .domain(data.map((d, i) => i.toString()))
        .padding(0.2);

      chart
        .append("g")
        .attr("transform", `translate(0,${height})`)
        .call(
          d3
            .axisBottom(x)
            .tickFormat(() => "")
            .tickSize(0)
        );

      const yMin = d3.min(data, (d) => d.pnl) ?? 0;
      const yMax = d3.max(data, (d) => d.pnl) ?? 0;

      const y = d3.scaleLinear().domain([yMin, yMax]).range([height, 0]);

      chart.append("g").call(d3.axisLeft(y));

      chart
        .selectAll(".bar")
        .data(data)
        .enter()
        .append("rect")
        .attr("class", "bar")
        .attr("x", (d, i) => x(i.toString()) || 0)
        .attr("y", (d) => y(Math.max(0, d.pnl)))
        .attr("width", x.bandwidth())
        .attr("height", (d) => Math.abs(y(d.pnl) - y(0)))
        .attr("fill", (d) => (d.pnl >= 0 ? "#10b981" : "#ef4444"))
        .style("opacity", 0.9);
    }
  }, [data]);

  return <svg ref={d3Container} style={{ width: "100%", height: "100%" }} />;
};

export default PnLChart;
