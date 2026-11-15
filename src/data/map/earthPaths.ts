/**
 * Recognizable stylized Earth continent silhouettes (holo-map backdrop).
 * viewBox: 0 0 1000 520 — territories tile strictly inside these bounds.
 * Silhouettes are sized to wrap each continent's territory partition with
 * no cross-continent fill overlap (esp. Europe/Africa at the Med).
 */
export const OCEAN_VIEW = { w: 1000, h: 520 };

export const CONTINENT_SILHOUETTES: { id: string; d: string }[] = [
  {
    id: "na",
    d: "M 50,95 L 55,48 L 145,42 L 240,55 L 320,75 L 345,110 L 340,165 L 300,215 L 240,265 L 170,295 L 110,285 L 75,230 L 55,160 Z",
  },
  {
    id: "gl",
    d: "M 350,30 L 430,28 L 435,70 L 422,108 L 385,112 L 350,85 Z",
  },
  {
    id: "sa",
    d: "M 175,305 L 275,300 L 320,345 L 320,450 L 290,510 L 210,512 L 185,460 L 175,375 Z",
  },
  {
    // Europe includes S. Europe / Med north shore — ends above Africa
    id: "eu",
    d: "M 430,75 L 485,55 L 565,62 L 645,120 L 655,195 L 580,235 L 520,268 L 450,268 L 430,210 L 425,140 Z",
  },
  {
    // Africa starts just below S. Europe shared border (y≈270)
    id: "af",
    d: "M 425,270 L 520,268 L 590,272 L 610,340 L 600,425 L 555,500 L 455,505 L 420,430 L 415,350 Z",
  },
  {
    // Asia wraps Middle East → India → Siam → Pacific arc
    id: "as",
    d: "M 570,115 L 640,50 L 750,38 L 880,52 L 975,88 L 1000,145 L 998,215 L 960,260 L 900,275 L 835,305 L 832,365 L 720,362 L 635,350 L 570,300 L 565,230 L 570,165 Z",
  },
  {
    id: "au",
    d: "M 785,348 L 875,348 L 970,360 L 978,420 L 955,495 L 850,502 L 788,478 L 772,408 Z",
  },
];

export const SEA_ROUTES: { d: string }[] = [
  { d: "M 90,150 Q 220,40 360,70" },
  { d: "M 320,145 Q 380,125 435,115" },
  { d: "M 170,295 Q 290,340 435,275" },
  { d: "M 280,470 Q 370,495 480,480" },
  { d: "M 565,285 Q 670,335 800,390" },
  { d: "M 940,160 Q 990,210 970,290" },
  { d: "M 80,120 Q 25,200 70,280" },
  { d: "M 510,250 Q 530,262 520,275" },
];
