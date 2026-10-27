// Real runs on known hardware, measured by the author, shown in the ranking
// until enough people have submitted results. Never invented: every entry here
// was run in a browser on the machine it names.

/** @type {{ test: "multi" | "single", label: string, points: number, detail: string }[]} */
export const REFERENCE = [
  {
    test: "multi",
    label: "Intel Core i9-9900K",
    points: 1792,
    detail: "Reference run · 8 cores, 16 threads · Chrome 152 on Linux",
  },
  {
    test: "single",
    label: "Intel Core i9-9900K",
    points: 235,
    detail: "Reference run · 1 thread · Chrome 152 on Linux",
  },
];
