"use client";

import React, { useEffect, useRef } from "react";
import * as d3 from "d3";

interface CumulativePnLChartProps {
  data: {
    pnl: number;
    close_date: string;
  }[];
}

const CumulativePnLChart: React.FC<CumulativePnLChartProps> = ({ data }) => {
  const d3Container = useRef(null);

  useEffect(() => {
    if (data && data.length > 0 && d3Container.current) {
      const svg = d3.select(d3Container.current);
      svg.selectAll("*").remove();

      const margin = { top: 20, right: 30, bottom: 40, left: 60 };
      const width = 800 - margin.left - margin.right;
      const height = 400 - margin.top - margin.bottom;

      const chart = svg
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

      // Sort data by close date and calculate cumulative P/L
      const sortedData = [...data].sort(
        (a, b) =>
          new Date(a.close_date).getTime() - new Date(b.close_date).getTime()
      );
      let cumulativePnl = 0;
      const cumulativeData = sortedData.map((d) => {
        cumulativePnl += d.pnl;
        return { date: new Date(d.close_date), value: cumulativePnl };
      });

      const x = d3
        .scaleTime()
        .domain(d3.extent(cumulativeData, (d) => d.date) as [Date, Date])
        .range([0, width]);

      chart
        .append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x));

      const yMin = d3.min(cumulativeData, (d) => d.value) ?? 0;
      const yMax = d3.max(cumulativeData, (d) => d.value) ?? 0;

      const y = d3.scaleLinear().domain([yMin, yMax]).range([height, 0]);

      chart.append("g").call(d3.axisLeft(y));

      chart
        .append("path")
        .datum(cumulativeData)
        .attr("fill", "none")
        .attr("stroke", "#3b82f6")
        .attr("stroke-width", 2.5)
        .attr(
          "d",
          d3
            .line<{ date: Date; value: number }>()
            .x((d) => x(d.date))
            .y((d) => y(d.value))
        );

      // Add area fill under the line
      chart
        .append("path")
        .datum(cumulativeData)
        .attr("fill", "url(#gradient)")
        .attr(
          "d",
          d3
            .area<{ date: Date; value: number }>()
            .x((d) => x(d.date))
            .y0(height)
            .y1((d) => y(d.value))
        );

      // Add gradient for area
      const defs = svg.append("defs");
      const gradient = defs
        .append("linearGradient")
        .attr("id", "gradient")
        .attr("x1", "0%")
        .attr("y1", "0%")
        .attr("x2", "0%")
        .attr("y2", "100%");

      gradient
        .append("stop")
        .attr("offset", "0%")
        .attr("stop-color", "#3b82f6")
        .attr("stop-opacity", 0.2);

      gradient
        .append("stop")
        .attr("offset", "100%")
        .attr("stop-color", "#3b82f6")
        .attr("stop-opacity", 0);
    }
  }, [data]);

  return <svg ref={d3Container} style={{ width: "100%", height: "100%" }} />;
};

export default CumulativePnLChart;
