// Hardware standards: what each class of PC typically scores in Bench Lab.
//
// These are estimates, not measurements. Each starts from a real Bench Lab run
// on an Intel Core i9-9900K (1,792 multi-core, 235 single-core) and is scaled by
// how much faster that class of processor is in published CPU benchmarks.
// They're a guide to where a machine sits, not a promise.

/**
 * @typedef {object} Standard
 * @property {string} id
 * @property {string} name
 * @property {string} hardware  the class of processor it stands for
 * @property {number} multi
 * @property {number} single
 */

/** @type {readonly Standard[]} */
export const STANDARDS = Object.freeze([
  {
    id: "everyday",
    name: "Everyday PC",
    hardware: "6 cores · Core i5 or Ryzen 5 class",
    multi: 2200,
    single: 340,
  },
  {
    id: "gaming",
    name: "Gaming PC",
    hardware: "8 cores · Core i7 or Ryzen 7 class",
    multi: 3600,
    single: 375,
  },
  {
    id: "high-end",
    name: "High-end PC",
    hardware: "16 cores · Core i9 or Ryzen 9 class",
    multi: 5900,
    single: 425,
  },
  {
    id: "workstation",
    name: "Workstation",
    hardware: "32 cores · Threadripper class",
    multi: 10000,
    single: 380,
  },
]);
