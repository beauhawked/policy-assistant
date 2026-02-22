"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { SyncButton } from "@/components/sync-button";
import { formatDate } from "@/lib/format";
import type { BillIndexItem } from "@/lib/types";

interface BillDashboardProps {
  year: string;
  generatedAt?: string;
  items: BillIndexItem[];
}

function toTitleCase(value: string): string {
  return value
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function BillDashboard({ year, generatedAt, items }: BillDashboardProps) {
  const [query, setQuery] = useState("");
  const [chamberFilter, setChamberFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const types = useMemo(
    () => [
      ...new Set(
        items
          .map((item) => item.type)
          .filter(Boolean)
          .map((type) => type.toUpperCase()),
      ),
    ].sort(),
    [items],
  );

  const categories = useMemo(
    () => [
      ...new Set(
        items
          .flatMap((item) => item.categories)
          .filter(Boolean)
          .map((category) => category.trim()),
      ),
    ]
      .sort((left, right) => left.localeCompare(right))
      .slice(0, 80),
    [items],
  );

  const filtered = useMemo(() => {
    const lowered = query.toLowerCase();

    return items.filter((item) => {
      const matchesQuery =
        lowered.length === 0 ||
        item.billName.toLowerCase().includes(lowered) ||
        item.displayName.toLowerCase().includes(lowered) ||
        item.description.toLowerCase().includes(lowered) ||
        item.authorNames.some((name) => name.toLowerCase().includes(lowered));

      const matchesChamber =
        chamberFilter === "all" ||
        item.originChamber.toLowerCase() === chamberFilter ||
        item.currentChamber.toLowerCase() === chamberFilter;

      const matchesType = typeFilter === "all" || item.type.toUpperCase() === typeFilter;

      const matchesCategory =
        categoryFilter === "all" ||
        item.categories.some((category) => category.toLowerCase() === categoryFilter);

      return matchesQuery && matchesChamber && matchesType && matchesCategory;
    });
  }, [categoryFilter, chamberFilter, items, query, typeFilter]);

  return (
    <div className="panel">
      <div className="controls">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by bill number, description, or author"
          aria-label="Search bills"
        />

        <select value={chamberFilter} onChange={(event) => setChamberFilter(event.target.value)}>
          <option value="all">All chambers</option>
          <option value="house">House</option>
          <option value="senate">Senate</option>
        </select>

        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          <option value="all">All bill types</option>
          {types.map((type) => (
            <option value={type} key={type}>
              {toTitleCase(type)}
            </option>
          ))}
        </select>

        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="all">All categories</option>
          {categories.map((category) => (
            <option key={category} value={category.toLowerCase()}>
              {category}
            </option>
          ))}
        </select>

        <SyncButton year={year} onCompleted={() => window.location.reload()} />
      </div>

      <div className="small-muted" style={{ padding: "0 1rem 0.25rem" }}>
        Showing {filtered.length} of {items.length} bills. Last local sync: {formatDate(generatedAt)}.
      </div>

      <div className="bill-grid">
        {filtered.map((item) => (
          <Link className="bill-card" key={item.billName} href={`/bill?name=${encodeURIComponent(item.billName)}`}>
            <div className="bill-head">
              <div className="bill-name">{item.displayName}</div>
              <div className="meta">
                {item.originChamber} {"->"} {item.currentChamber}
              </div>
            </div>

            <div style={{ marginTop: "0.45rem" }}>{item.description}</div>

            <div className="badge-row">
              <span className="badge accent">{item.type}</span>
              <span className="badge">{item.stage}</span>
              <span className="badge">{item.status}</span>
              {item.categories.slice(0, 2).map((category) => (
                <span className="badge" key={category}>
                  {category}
                </span>
              ))}
            </div>

            <div className="meta" style={{ marginTop: "0.6rem" }}>
              {item.authorNames.length > 0 ? `Authors: ${item.authorNames.join(", ")}` : "Author information unavailable"}
            </div>
            <div className="small-muted" style={{ marginTop: "0.2rem" }}>
              Latest version: {item.latestVersionName ?? "N/A"} | Last update: {formatDate(item.updatedAt)}
            </div>
          </Link>
        ))}

        {filtered.length === 0 ? (
          <div className="panel" style={{ padding: "1rem" }}>
            No bills matched your filters.
          </div>
        ) : null}
      </div>
    </div>
  );
}
