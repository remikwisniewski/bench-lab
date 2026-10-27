// Published specifications of common CPUs: cores, threads and cache sizes.
// These are the manufacturers' figures, used only to match what the browser
// measures. L2 is per performance core (Apple: per performance cluster); the
// last column is the last-level cache (Apple: the system level cache).

/** @typedef {import("../core/hardware.js").CpuSpec} CpuSpec */

/** @param {CpuSpec["vendor"]} vendor @param {CpuSpec["segment"]} segment @param {number} year @param {string} [igpu] */
const make =
  (vendor, segment, year, igpu) =>
  /** @param {string} name @param {number} cores @param {number} threads @param {number} l2KB @param {number} l3MB */
  (name, cores, threads, l2KB, l3MB) =>
    /** @type {CpuSpec} */ ({
      name,
      vendor,
      arch: vendor === "Apple" || vendor === "Qualcomm" ? "arm" : "x86",
      cores,
      threads,
      l2KB,
      l3MB,
      segment,
      year,
      igpu,
    });

const coffee = make("Intel", "desktop", 2018, "UHD Graphics 630");
const comet = make("Intel", "desktop", 2020, "UHD Graphics 630");
const rocket = make("Intel", "desktop", 2021, "UHD Graphics 750");
const alder = make("Intel", "desktop", 2021, "UHD Graphics 770");
const raptor = make("Intel", "desktop", 2022, "UHD Graphics 770");
const raptorRefresh = make("Intel", "desktop", 2023, "UHD Graphics 770");
const arrow = make("Intel", "desktop", 2024, "Intel Graphics");
const whiskey = make("Intel", "laptop", 2018, "UHD Graphics 620");
const tiger = make("Intel", "laptop", 2020, "Iris Xe Graphics");
const alderMobile = make("Intel", "laptop", 2022, "Iris Xe Graphics");
const meteor = make("Intel", "laptop", 2023, "Arc Graphics");
const lunar = make("Intel", "laptop", 2024, "Arc 140V");
const zenPlus = make("AMD", "desktop", 2018);
const zen2 = make("AMD", "desktop", 2019);
const zen3 = make("AMD", "desktop", 2020);
const zen3Apu = make("AMD", "desktop", 2021, "Radeon Graphics");
const zen4 = make("AMD", "desktop", 2022, "Radeon Graphics");
const zen5 = make("AMD", "desktop", 2024, "Radeon Graphics");
const amdMobile = (/** @type {number} */ year) => make("AMD", "laptop", year, "Radeon Graphics");
const apple = (/** @type {number} */ year) => make("Apple", "laptop", year, "Apple GPU");

/** @type {readonly CpuSpec[]} */
export const CPUS = Object.freeze([
  // Intel desktop
  coffee("Intel Core i5-8400", 6, 6, 256, 9),
  coffee("Intel Core i7-8700K", 6, 12, 256, 12),
  coffee("Intel Core i5-9600K", 6, 6, 256, 9),
  coffee("Intel Core i7-9700K", 8, 8, 256, 12),
  coffee("Intel Core i9-9900K", 8, 16, 256, 16),
  comet("Intel Core i5-10400", 6, 12, 256, 12),
  comet("Intel Core i7-10700K", 8, 16, 256, 16),
  comet("Intel Core i9-10900K", 10, 20, 256, 20),
  rocket("Intel Core i5-11400", 6, 12, 512, 12),
  rocket("Intel Core i7-11700K", 8, 16, 512, 16),
  alder("Intel Core i5-12400", 6, 12, 1280, 18),
  alder("Intel Core i5-12600K", 10, 16, 1280, 20),
  alder("Intel Core i7-12700K", 12, 20, 1280, 25),
  alder("Intel Core i9-12900K", 16, 24, 1280, 30),
  raptor("Intel Core i5-13400", 10, 16, 1280, 20),
  raptor("Intel Core i5-13600K", 14, 20, 2048, 24),
  raptor("Intel Core i7-13700K", 16, 24, 2048, 30),
  raptor("Intel Core i9-13900K", 24, 32, 2048, 36),
  raptorRefresh("Intel Core i7-14700K", 20, 28, 2048, 33),
  raptorRefresh("Intel Core i9-14900K", 24, 32, 2048, 36),
  arrow("Intel Core Ultra 5 245K", 14, 14, 3072, 24),
  arrow("Intel Core Ultra 7 265K", 20, 20, 3072, 30),
  arrow("Intel Core Ultra 9 285K", 24, 24, 3072, 36),
  // Intel laptop
  whiskey("Intel Core i5-8250U", 4, 8, 256, 6),
  whiskey("Intel Core i7-8565U", 4, 8, 256, 8),
  whiskey("Intel Core i7-10510U", 4, 8, 256, 8),
  tiger("Intel Core i5-1135G7", 4, 8, 1280, 8),
  tiger("Intel Core i7-1165G7", 4, 8, 1280, 12),
  alderMobile("Intel Core i7-1260P", 12, 16, 1280, 18),
  alderMobile("Intel Core i7-12700H", 14, 20, 1280, 24),
  alderMobile("Intel Core i7-1355U", 10, 12, 1280, 12),
  meteor("Intel Core Ultra 7 155H", 16, 22, 2048, 24),
  lunar("Intel Core Ultra 7 258V", 8, 8, 2560, 12),
  // AMD desktop
  zenPlus("AMD Ryzen 5 2600", 6, 12, 512, 16),
  zenPlus("AMD Ryzen 7 2700X", 8, 16, 512, 16),
  zen2("AMD Ryzen 5 3600", 6, 12, 512, 32),
  zen2("AMD Ryzen 7 3700X", 8, 16, 512, 32),
  zen2("AMD Ryzen 9 3900X", 12, 24, 512, 64),
  zen3("AMD Ryzen 5 5600X", 6, 12, 512, 32),
  zen3("AMD Ryzen 7 5800X", 8, 16, 512, 32),
  zen3("AMD Ryzen 7 5800X3D", 8, 16, 512, 96),
  zen3("AMD Ryzen 9 5900X", 12, 24, 512, 64),
  zen3("AMD Ryzen 9 5950X", 16, 32, 512, 64),
  zen3Apu("AMD Ryzen 5 5600G", 6, 12, 512, 16),
  zen3Apu("AMD Ryzen 7 5700G", 8, 16, 512, 16),
  zen4("AMD Ryzen 5 7600X", 6, 12, 1024, 32),
  zen4("AMD Ryzen 7 7700X", 8, 16, 1024, 32),
  zen4("AMD Ryzen 7 7800X3D", 8, 16, 1024, 96),
  zen4("AMD Ryzen 9 7950X", 16, 32, 1024, 64),
  zen4("AMD Ryzen 9 7950X3D", 16, 32, 1024, 128),
  zen5("AMD Ryzen 5 9600X", 6, 12, 1024, 32),
  zen5("AMD Ryzen 7 9700X", 8, 16, 1024, 32),
  zen5("AMD Ryzen 7 9800X3D", 8, 16, 1024, 96),
  zen5("AMD Ryzen 9 9950X", 16, 32, 1024, 64),
  // AMD laptop
  amdMobile(2020)("AMD Ryzen 7 4800U", 8, 16, 512, 8),
  amdMobile(2021)("AMD Ryzen 5 5500U", 6, 12, 512, 8),
  amdMobile(2021)("AMD Ryzen 7 5800U", 8, 16, 512, 16),
  amdMobile(2022)("AMD Ryzen 7 6800U", 8, 16, 512, 16),
  amdMobile(2023)("AMD Ryzen 7 7840U", 8, 16, 1024, 16),
  amdMobile(2024)("AMD Ryzen AI 9 HX 370", 12, 24, 1024, 24),
  // Apple
  apple(2020)("Apple M1", 8, 8, 12288, 8),
  apple(2021)("Apple M1 Pro", 10, 10, 12288, 24),
  apple(2022)("Apple M2", 8, 8, 16384, 8),
  apple(2023)("Apple M3", 8, 8, 16384, 8),
  apple(2024)("Apple M4", 10, 10, 16384, 8),
]);
