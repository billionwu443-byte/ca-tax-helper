// 2025 税年联邦 (Form 1040) + 加州 (Form 540) 计算引擎。纯函数，浏览器与 Node 通用。
// 数据来源：IRS Rev. Proc. 2024-40 + 2025 年 OBBBA 法案调整；FTB 2025 Tax News (2025-10) 公布的税率表。
// 540NR 算法依据 FTB 2025 540NR 说明及 Schedule CA (540NR) 第 IV 部分。
(function (root) {
  'use strict';

  const INF = Infinity;
  const RATES_FED = [0.10, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37];

  const FED = {
    brackets: {
      single: [11925, 48475, 103350, 197300, 250525, 626350, INF],
      mfj:    [23850, 96950, 206700, 394600, 501050, 751600, INF],
      qss:    [23850, 96950, 206700, 394600, 501050, 751600, INF],
      mfs:    [11925, 48475, 103350, 197300, 250525, 375800, INF],
      hoh:    [17000, 64850, 103350, 197300, 250500, 626350, INF],
    },
    ltcg0:  { single: 48350, mfj: 96700, qss: 96700, mfs: 48350, hoh: 64750 },
    ltcg15: { single: 533400, mfj: 600050, qss: 600050, mfs: 300000, hoh: 566700 },
    // Form 6251 (2025)：豁免额、递减起点（25%）、26% / 28% 分界点
    amt: {
      exemption: { single: 88100, hoh: 88100, mfj: 137000, qss: 137000, mfs: 68500 },
      phase: { single: 626350, hoh: 626350, mfj: 1252700, qss: 1252700, mfs: 626350 },
      bracket: { single: 239100, hoh: 239100, mfj: 239100, qss: 239100, mfs: 119550 },
      mfsAddThr: 900350, mfsAddMax: 68500,
    },
    std:    { single: 15750, mfj: 31500, qss: 31500, mfs: 15750, hoh: 23625 },
    stdAddl: { single: 2000, hoh: 2000, mfj: 1600, qss: 1600, mfs: 1600 },
    niitThr: { single: 200000, hoh: 200000, mfj: 250000, qss: 250000, mfs: 125000 },
    addlMedThr: { single: 200000, hoh: 200000, mfj: 250000, qss: 200000, mfs: 125000 },
    ssWageBase: 176100,
    ctc: 2200, ctcRefundable: 1700, odc: 500,
    ctcPhase: { mfj: 400000, other: 200000 },
    saltCap: 40000, saltCapMfs: 20000, saltPhase: 500000, saltPhaseMfs: 250000, saltFloor: 10000, saltFloorMfs: 5000,
    seniorDed: 6000, seniorPhase: { mfj: 150000, other: 75000 },
    tipsCap: 25000, otCap: { mfj: 25000, other: 12500 }, tipsOtPhase: { mfj: 300000, other: 150000 },
    carCap: 10000, carPhase: { mfj: 200000, other: 100000 },
    studentLoan: { cap: 2500, mfj: [170000, 200000], other: [85000, 100000] },
    qbiThr: { mfj: 394600, other: 197300 },
    eitc: [
      { rate: 0.0765, earned: 8490,  max: 649,  phaseRate: 0.0765 },
      { rate: 0.34,   earned: 12730, max: 4328, phaseRate: 0.1598 },
      { rate: 0.40,   earned: 17880, max: 7152, phaseRate: 0.2106 },
      { rate: 0.45,   earned: 17880, max: 8046, phaseRate: 0.2106 },
    ],
    eitcPhaseStart: { none: { mfj: 17730, other: 10620 }, kids: { mfj: 30470, other: 23350 } },
    eitcInvLimit: 11950,
  };

  const RATES_CA = [0.01, 0.02, 0.04, 0.06, 0.08, 0.093, 0.103, 0.113, 0.123];
  const CA = {
    brackets: {
      single: [11079, 26264, 41452, 57542, 72724, 371479, 445771, 742953, INF],
      mfs:    [11079, 26264, 41452, 57542, 72724, 371479, 445771, 742953, INF],
      mfj:    [22158, 52528, 82904, 115084, 145448, 742958, 891542, 1485906, INF],
      qss:    [22158, 52528, 82904, 115084, 145448, 742958, 891542, 1485906, INF],
      hoh:    [22173, 52530, 67716, 83805, 98990, 505208, 606251, 1010417, INF],
    },
    std: { single: 5706, mfs: 5706, mfj: 11412, qss: 11412, hoh: 11412 },
    personalCredit: 153,      // 每人份（单身 1 份，合报 2 份 = $306）
    dependentCredit: 475,
    seniorBlindCredit: 153,
    // FTB 2025 540 / 540NR 说明公布的门槛，与联邦 AGI 比较
    phaseThr: { single: 252203, mfs: 252203, hoh: 378310, mfj: 504411, qss: 504411 },
    renter: { limit: { single: 53994, mfs: 53994, mfj: 107988, hoh: 107988, qss: 107988 },
              amount: { single: 60, mfs: 60, mfj: 120, hoh: 120, qss: 120 } },
    mhstThr: 1000000,
    sdiRate: 0.012,
    mortgageLimit: 1000000,
    yctc: { max: 1189, phaseStart: 27425, phaseEnd: 32901 },
    // 工作表 Part II：联邦 AGI 低于这些金额时不用再按 AGI 查表（0 / 1 / 2+ 个孩子）
    caleitc: { earnedMax: 32900, invLimit: 4814, agiCheck: [4661, 6998, 9823, 9823] },
    // Schedule P (540 / 540NR) 2025：豁免额、递减起点、税率 7%
    amt: {
      exemption: { single: 92749, hoh: 92749, mfj: 123667, qss: 123667, mfs: 61830 },
      phase: { single: 347808, hoh: 347808, mfj: 463745, qss: 463745, mfs: 231868 },
      rate: 0.07, mfsAddThr: 479188, mfsAddMax: 61830,
    },
    estSchedule: [['2026-04-15', 0.30], ['2026-06-15', 0.40], ['2026-09-15', 0], ['2027-01-15', 0.30]],
  };

  // FTB 3514 "2025 Earned Income Tax Credit Table" 原表：第 k 项对应劳动所得 $(50k+1) ~ $(50k+50)，共 658 档，上限 $32,900。
  const CALEITC_TABLE = [
    [2,5,8,11,15,18,21,24,28,31,34,37,41,44,47,50,54,57,60,63,67,70,73,76,80,83,86,89,93,96,99,102,106,109,112,115,119,122,125,128,132,135,138,141,145,148,151,154,158,161,164,167,171,174,177,180,184,187,190,193,197,200,203,206,210,213,216,219,223,226,229,232,236,239,242,246,249,252,255,259,262,265,268,272,275,278,281,285,288,291,294,298,301,302,299,296,292,289,286,283,279,276,273,270,266,263,260,257,253,252,252,251,251,250,250,250,249,249,248,248,247,247,246,246,245,245,244,244,244,243,243,242,242,241,241,240,240,239,239,239,238,238,237,237,236,236,235,235,234,234,233,233,233,232,232,231,231,230,230,229,229,228,228,228,227,227,226,226,225,225,224,224,223,223,222,222,222,221,221,220,220,219,219,218,218,217,217,216,216,216,215,215,214,214,213,213,212,212,211,211,211,210,210,209,209,208,208,207,207,206,206,205,205,205,204,204,203,203,202,202,201,201,200,200,200,199,199,198,198,197,197,196,196,195,195,194,194,194,193,193,192,192,191,191,190,190,189,189,188,188,188,187,187,186,186,185,185,184,184,183,183,183,182,182,181,181,180,180,179,179,178,178,177,177,177,176,176,175,175,174,174,173,173,172,172,172,171,171,170,170,169,169,168,168,167,167,166,166,166,165,165,164,164,163,163,162,162,161,161,160,160,160,159,159,158,158,157,157,156,156,155,155,155,154,154,153,153,152,152,151,151,150,150,149,149,149,148,148,147,147,146,146,145,145,144,144,144,143,143,142,142,141,141,140,140,139,139,138,138,138,137,137,136,136,135,135,134,134,133,133,132,132,132,131,131,130,130,129,129,128,128,127,127,127,126,126,125,125,124,124,123,123,122,122,121,121,121,120,120,119,119,118,118,117,117,116,116,116,115,115,114,114,113,113,112,112,111,111,110,110,110,109,109,108,108,107,107,106,106,105,105,104,104,104,103,103,102,102,101,101,100,100,99,99,99,98,98,97,97,96,96,95,95,94,94,93,93,93,92,92,91,91,90,90,89,89,88,88,88,87,87,86,86,85,85,84,84,83,83,82,82,82,81,81,80,80,79,79,78,78,77,77,76,76,76,75,75,74,74,73,73,72,72,71,71,71,70,70,69,69,68,68,67,67,66,66,65,65,65,64,64,63,63,62,62,61,61,60,60,60,59,59,58,58,57,57,56,56,55,55,54,54,54,53,53,52,52,51,51,50,50,49,49,48,48,48,47,47,46,46,45,45,44,44,43,43,43,42,42,41,41,40,40,39,39,38,38,37,37,37,36,36,35,35,34,34,33,33,32,32,32,31,31,30,30,29,29,28,28,27,27,26,26,26,25,25,24,24,23,23,22,22,21,21,20,20,20,19,19,18,18,17,17,16,16,15,15,15,14,14,13,13,12,12,11,11,10,10,9,9,9,8,8,7,7,6,6,5,5,4,4,4,3,3,2,2,1,1],
    [7,22,36,51,65,80,94,109,123,137,152,166,181,195,210,224,239,253,267,282,296,311,325,340,354,369,383,398,412,426,441,455,470,484,499,513,528,542,556,571,585,600,614,629,643,658,672,687,701,715,730,744,759,773,788,802,817,831,845,860,874,889,903,918,932,947,961,976,990,1004,1019,1033,1048,1062,1077,1091,1106,1120,1134,1149,1163,1178,1192,1207,1221,1236,1250,1265,1279,1293,1308,1322,1337,1351,1366,1380,1395,1409,1423,1438,1452,1467,1481,1496,1510,1525,1539,1554,1568,1582,1597,1611,1626,1640,1655,1669,1684,1698,1712,1727,1741,1756,1770,1785,1799,1814,1828,1843,1857,1871,1886,1900,1915,1929,1944,1958,1973,1987,2001,2016,2014,2000,1986,1971,1957,1942,1928,1913,1899,1884,1870,1856,1841,1827,1812,1798,1783,1769,1754,1740,1725,1711,1697,1682,1668,1653,1639,1624,1610,1595,1581,1567,1552,1538,1523,1509,1494,1480,1465,1451,1436,1422,1408,1393,1379,1364,1350,1335,1321,1306,1292,1278,1263,1249,1234,1220,1205,1191,1176,1162,1147,1133,1119,1104,1090,1075,1061,1046,1032,1017,1003,989,974,960,945,931,916,902,887,873,858,844,830,815,801,786,772,757,743,728,714,700,685,671,656,642,634,632,631,629,628,626,625,623,622,620,619,617,616,614,613,611,610,608,607,605,604,602,601,599,598,596,595,593,592,590,589,587,586,584,583,581,580,578,577,575,574,572,571,569,568,566,565,563,562,560,559,557,556,554,553,551,550,548,547,545,544,542,541,539,538,536,535,533,532,530,529,527,526,524,523,521,520,518,517,515,514,512,511,509,508,506,505,503,502,500,499,497,496,494,493,491,490,488,487,485,484,482,481,479,477,476,474,473,471,470,468,467,465,464,462,461,459,458,456,455,453,452,450,449,447,446,444,443,441,440,438,437,435,434,432,431,429,428,426,425,423,422,420,419,417,416,414,413,411,410,408,407,405,404,402,401,399,398,396,395,393,392,390,389,387,386,384,383,381,380,378,377,375,374,372,371,369,368,366,365,363,362,360,359,357,356,354,353,351,350,348,347,345,344,342,341,339,338,336,335,333,332,330,329,327,326,324,323,321,320,318,317,315,314,312,310,309,307,306,304,303,301,300,298,297,295,294,292,291,289,288,286,285,283,282,280,279,277,276,274,273,271,270,268,267,265,264,262,261,259,258,256,255,253,252,250,249,247,246,244,243,241,240,238,237,235,234,232,231,229,228,226,225,223,222,220,219,217,216,214,213,211,210,208,207,205,204,202,201,199,198,196,195,193,192,190,189,187,186,184,183,181,180,178,177,175,174,172,171,169,168,166,165,163,162,160,159,157,156,154,153,151,150,148,147,145,143,142,140,139,137,136,134,133,131,130,128,127,125,124,122,121,119,118,116,115,113,112,110,109,107,106,104,103,101,100,98,97,95,94,92,91,89,88,86,85,83,82,80,79,77,76,74,73,71,70,68,67,65,64,62,61,59,58,56,55,53,52,50,49,47,46,44,43,41,40,38,37,35,34,32,31,29,28,26,25,23,22,20,19,17,16,14,13,11,10,8,7,5,4,2,1],
    [9,26,43,60,77,94,111,128,145,162,179,196,213,230,247,264,281,298,315,332,349,366,383,400,417,434,451,468,485,502,519,536,553,570,587,604,621,638,655,672,689,706,723,740,757,774,791,808,825,842,859,876,893,910,927,944,961,978,995,1012,1029,1046,1063,1080,1097,1114,1131,1148,1165,1182,1199,1216,1233,1250,1267,1284,1301,1318,1335,1352,1369,1386,1403,1420,1437,1454,1471,1488,1505,1522,1539,1556,1573,1590,1607,1624,1641,1658,1675,1692,1709,1726,1743,1760,1777,1794,1811,1828,1845,1862,1879,1896,1913,1930,1947,1964,1981,1998,2015,2032,2049,2066,2083,2100,2117,2134,2151,2168,2185,2202,2219,2236,2253,2270,2287,2304,2321,2338,2355,2372,2389,2406,2423,2440,2457,2474,2491,2508,2525,2542,2559,2576,2593,2610,2627,2644,2661,2678,2695,2712,2729,2746,2763,2780,2797,2814,2831,2848,2865,2882,2899,2916,2933,2950,2967,2984,3001,3018,3035,3052,3069,3086,3103,3120,3137,3154,3171,3188,3205,3222,3239,3256,3273,3290,3307,3324,3339,3322,3305,3288,3271,3254,3237,3220,3203,3186,3169,3152,3135,3118,3101,3084,3067,3050,3033,3016,2999,2982,2965,2948,2931,2914,2897,2880,2863,2846,2829,2812,2795,2778,2761,2744,2727,2710,2693,2676,2659,2642,2625,2608,2591,2574,2557,2540,2523,2506,2489,2472,2455,2438,2421,2404,2387,2370,2353,2336,2319,2302,2285,2268,2251,2234,2217,2200,2183,2166,2149,2132,2115,2098,2081,2064,2047,2030,2013,1996,1979,1962,1945,1928,1911,1894,1877,1860,1843,1826,1809,1792,1775,1758,1741,1724,1707,1690,1673,1656,1639,1622,1605,1588,1571,1554,1537,1520,1503,1486,1469,1452,1435,1418,1401,1384,1367,1350,1333,1316,1299,1282,1265,1248,1231,1214,1197,1180,1163,1146,1129,1112,1095,1078,1061,1044,1027,1010,993,976,959,942,925,908,891,874,857,840,823,806,789,772,755,738,721,704,687,670,653,636,633,631,629,626,624,622,620,618,616,614,612,610,608,605,603,601,599,597,595,593,591,589,587,584,582,580,578,576,574,572,570,568,566,563,561,559,557,555,553,551,549,547,545,542,540,538,536,534,532,530,528,526,524,521,519,517,515,513,511,509,507,505,503,500,498,496,494,492,490,488,486,484,482,479,477,475,473,471,469,467,465,463,461,458,456,454,452,450,448,446,444,442,440,438,435,433,431,429,427,425,423,421,419,417,414,412,410,408,406,404,402,400,398,396,393,391,389,387,385,383,381,379,377,375,372,370,368,366,364,362,360,358,356,354,351,349,347,345,343,341,339,337,335,333,330,328,326,324,322,320,318,316,314,312,309,307,305,303,301,299,297,295,293,291,288,286,284,282,280,278,276,274,272,270,267,265,263,261,259,257,255,253,251,249,246,244,242,240,238,236,234,232,230,228,225,223,221,219,217,215,213,211,209,207,204,202,200,198,196,194,192,190,188,186,183,181,179,177,175,173,171,169,167,165,162,160,158,156,154,152,150,148,146,144,141,139,137,135,133,131,129,127,125,123,120,118,116,114,112,110,108,106,104,102,99,97,95,93,91,89,87,85,83,81,78,76,74,72,70,68,66,64,62,60,57,55,53,51,49,47,45,43,41,39,36,34,32,30,28,26,24,22,20,18,16,13,11,9,7,5,3,1],
    [10,29,48,67,86,105,125,144,163,182,201,220,239,258,278,297,316,335,354,373,392,411,431,450,469,488,507,526,545,564,584,603,622,641,660,679,698,717,737,756,775,794,813,832,851,870,890,909,928,947,966,985,1004,1023,1043,1062,1081,1100,1119,1138,1157,1176,1196,1215,1234,1253,1272,1291,1310,1329,1349,1368,1387,1406,1425,1444,1463,1482,1502,1521,1540,1559,1578,1597,1616,1635,1655,1674,1693,1712,1731,1750,1769,1788,1808,1827,1846,1865,1884,1903,1922,1941,1961,1980,1999,2018,2037,2056,2075,2094,2114,2133,2152,2171,2190,2209,2228,2247,2267,2286,2305,2324,2343,2362,2381,2400,2420,2439,2458,2477,2496,2515,2534,2553,2573,2592,2611,2630,2649,2668,2687,2706,2726,2745,2764,2783,2802,2821,2840,2859,2879,2898,2917,2936,2955,2974,2993,3012,3032,3051,3070,3089,3108,3127,3146,3165,3185,3204,3223,3242,3261,3280,3299,3318,3338,3357,3376,3395,3414,3433,3452,3471,3491,3510,3529,3548,3567,3586,3605,3624,3644,3663,3682,3701,3720,3739,3756,3737,3718,3699,3680,3661,3642,3622,3603,3584,3565,3546,3527,3508,3489,3469,3450,3431,3412,3393,3374,3355,3336,3316,3297,3278,3259,3240,3221,3202,3183,3163,3144,3125,3106,3087,3068,3049,3030,3010,2991,2972,2953,2934,2915,2896,2877,2857,2838,2819,2800,2781,2762,2743,2724,2704,2685,2666,2647,2628,2609,2590,2571,2551,2532,2513,2494,2475,2456,2437,2418,2398,2379,2360,2341,2322,2303,2284,2265,2245,2226,2207,2188,2169,2150,2131,2112,2092,2073,2054,2035,2016,1997,1978,1959,1939,1920,1901,1882,1863,1844,1825,1806,1786,1767,1748,1729,1710,1691,1672,1653,1633,1614,1595,1576,1557,1538,1519,1500,1480,1461,1442,1423,1404,1385,1366,1347,1327,1308,1289,1270,1251,1232,1213,1194,1174,1155,1136,1117,1098,1079,1060,1041,1021,1002,983,964,945,926,907,888,868,849,830,811,792,773,754,735,715,696,677,658,639,633,631,629,626,624,622,620,618,616,614,612,609,607,605,603,601,599,597,595,592,590,588,586,584,582,580,577,575,573,571,569,567,565,563,560,558,556,554,552,550,548,546,543,541,539,537,535,533,531,529,526,524,522,520,518,516,514,511,509,507,505,503,501,499,497,494,492,490,488,486,484,482,480,477,475,473,471,469,467,465,463,460,458,456,454,452,450,448,445,443,441,439,437,435,433,431,428,426,424,422,420,418,416,414,411,409,407,405,403,401,399,397,394,392,390,388,386,384,382,379,377,375,373,371,369,367,365,362,360,358,356,354,352,350,348,345,343,341,339,337,335,333,330,328,326,324,322,320,318,316,313,311,309,307,305,303,301,299,296,294,292,290,288,286,284,282,279,277,275,273,271,269,267,264,262,260,258,256,254,252,250,247,245,243,241,239,237,235,233,230,228,226,224,222,220,218,216,213,211,209,207,205,203,201,198,196,194,192,190,188,186,184,181,179,177,175,173,171,169,167,164,162,160,158,156,154,152,150,147,145,143,141,139,137,135,132,130,128,126,124,122,120,118,115,113,111,109,107,105,103,101,98,96,94,92,90,88,86,84,81,79,77,75,73,71,69,66,64,62,60,58,56,54,52,49,47,45,43,41,39,37,35,32,30,28,26,24,22,20,17,15,13,11,9,7,5,3,1],
  ];

  // Schedule S 其他州税收抵免可抵的州（FTB 2025 Schedule S 说明 C、D 两节）
  const STATE_NAMES = {
    AL: 'Alabama', AK: 'Alaska', AS: 'American Samoa', AZ: 'Arizona', AR: 'Arkansas', CO: 'Colorado', CT: 'Connecticut',
    DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', GU: 'Guam', HI: 'Hawaii', ID: 'Idaho',
    IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
    MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska',
    NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
    ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', PR: 'Puerto Rico', RI: 'Rhode Island',
    SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VI: 'Virgin Islands',
    VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  };
  const OSTC = {
    resident: ['AL', 'AS', 'AR', 'CO', 'CT', 'DE', 'DC', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA',
      'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'PA', 'PR', 'RI', 'SC', 'TN', 'UT', 'VT',
      'VI', 'VA', 'WV', 'WI'],
    nonresident: ['AZ', 'GU', 'OR', 'VA'],
    noIncomeTax: ['AK', 'FL', 'NV', 'SD', 'TX', 'WA', 'WY'],
    caveat: {
      DC: '只限 DC 非法人营业税；DC 个人所得税只有加州和 DC 双重居民才能抵',
      NH: '只限 NH 营业利润税（Business Profits Tax）',
      TN: '只限 TN 消费税（excise tax）',
      VA: '加州居民只有同时是 VA 居民（双重居民）才能在加州抵；一般情况由 VA 给抵免',
    },
  };

  // 判断某州的税能否在加州抵免
  function ostcEligibility(st, residency) {
    if (!st) return { ok: false, reason: '没有选择州' };
    if (OSTC.noIncomeTax.includes(st)) return { ok: false, reason: `${STATE_NAMES[st]} 没有个人所得税，不存在双重征税` };
    const asRes = OSTC.resident.includes(st);
    const asNon = OSTC.nonresident.includes(st);
    if (residency === 'full') {
      if (asRes) return { ok: true, caveat: OSTC.caveat[st] };
      if (['AZ', 'OR', 'GU'].includes(st)) return { ok: false, reason: `加州居民在 ${STATE_NAMES[st]} 的收入由 ${STATE_NAMES[st]} 给抵免：在它的非居民报税表上申请，加州不给` };
      return { ok: false, reason: `${STATE_NAMES[st]} 不在可抵免名单内` };
    }
    if (residency === 'non') {
      if (asNon) return { ok: true, caveat: '非居民只能抵居住州的税，且只限加州也征税的那部分收入' };
      return { ok: false, reason: `加州非居民只有住在 AZ、GU、OR、VA 才能在加州抵免；住在 ${STATE_NAMES[st]} 的话由 ${STATE_NAMES[st]} 给抵免` };
    }
    // 部分年份居民：居民期间按居民规则，非居民期间按非居民规则
    if (asRes || asNon) {
      return { ok: true, caveat: asRes && asNon ? OSTC.caveat[st] : asRes
        ? '只计入你住在加州期间、来源于该州的收入'
        : '只计入你不住加州期间、该州作为居住州征税且加州也征税的收入' };
    }
    if (['AZ', 'OR', 'GU'].includes(st)) return { ok: false, reason: `居民期间在 ${STATE_NAMES[st]} 的收入要在 ${STATE_NAMES[st]} 申请抵免` };
    return { ok: false, reason: `${STATE_NAMES[st]} 不在可抵免名单内` };
  }

  // 按 FTB 3514 表查 CalEITC；kids 取 0–3（3 个以上按 3）
  function calEitcLookup(amount, kids) {
    const x = Math.round(amount);
    if (x < 1 || x > CA.caleitc.earnedMax) return 0;
    return CALEITC_TABLE[Math.min(kids, 3)][Math.ceil(x / 50) - 1];
  }

  const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  const pos = (x) => Math.max(0, x);
  const isJoint = (s) => s === 'mfj';
  const r2 = (x) => Math.round(x * 100) / 100;

  // 累进税：返回总税额与每档明细
  function bracketTax(income, tops, rates) {
    let tax = 0, lower = 0;
    const rows = [];
    for (let i = 0; i < tops.length; i++) {
      const top = tops[i];
      const inBand = pos(Math.min(income, top) - lower);
      const t = inBand * rates[i];
      rows.push({ rate: rates[i], from: lower, to: top, amount: inBand, tax: t });
      tax += t;
      lower = top;
      if (income <= top) {
        for (let j = i + 1; j < tops.length; j++) {
          rows.push({ rate: rates[j], from: tops[j - 1], to: tops[j], amount: 0, tax: 0 });
        }
        break;
      }
    }
    return { tax, rows };
  }

  function marginalRate(income, tops, rates) {
    for (let i = 0; i < tops.length; i++) if (income <= tops[i]) return rates[i];
    return rates[rates.length - 1];
  }

  function compute(raw) {
    const vals = {};
    for (const k in raw) vals[k] = ['boolean', 'string', 'object'].includes(typeof raw[k]) && raw[k] !== null ? raw[k] : n(raw[k]);
    // 未填写的数字栏一律按 0
    const i = new Proxy(vals, { get: (t, k) => (k in t ? t[k] : 0) });
    const s = i.status || 'single';
    const joint = isJoint(s);
    const mfs = s === 'mfs';
    const grp = joint ? 'mfj' : 'other';
    const warn = [];
    const kids = pos(i.kidsU17);
    const kidsU6 = Math.min(pos(i.kidsU6), kids);
    const otherDeps = pos(i.otherDeps);

    // ---------- 联邦 ----------
    const W = i.wages;
    const netCap = i.stGain + i.ltGain;
    const capLimit = mfs ? -1500 : -3000;
    const capIncome = netCap >= 0 ? netCap : Math.max(netCap, capLimit);
    if (netCap < capLimit) warn.push(`资本净亏损 ${fmt(-netCap)} 超过当年可抵 ${fmt(-capLimit)}，余额可结转到以后年度（联邦与加州规则相同）。`);
    const prefLTCG = netCap > 0 && i.ltGain > 0 ? Math.min(i.ltGain, netCap) : 0;
    const qd = Math.min(i.qualDiv, i.ordDiv);

    const seBase = i.seProfit * 0.9235 >= 400 ? i.seProfit * 0.9235 : 0;
    const seSS = 0.124 * Math.min(seBase, pos(FED.ssWageBase - W));
    const seMed = 0.029 * seBase;
    const seTax = seSS + seMed;
    const halfSE = seTax / 2;
    const seHealth = Math.min(i.seHealth, pos(i.seProfit - halfSE));

    const incomeExSS = W + i.taxableInt + i.ordDiv + capIncome + i.seProfit + i.rental + i.unemployment + i.retirement + i.otherInc;
    const adjExSL = halfSE + seHealth + i.ira + i.hsa;

    // 社安金应税部分（Pub 915 工作表）
    const ssb = i.ssBenefits;
    let ssTaxable = 0;
    if (ssb > 0) {
      const b1 = mfs ? 0 : joint ? 32000 : 25000;
      const b2 = mfs ? 0 : joint ? 44000 : 34000;
      const prov = incomeExSS - adjExSL + i.caMuniInt + i.otherMuniInt + 0.5 * ssb;
      if (prov <= b1) ssTaxable = 0;
      else if (prov <= b2) ssTaxable = Math.min(0.5 * (prov - b1), 0.5 * ssb);
      else ssTaxable = Math.min(0.85 * ssb, 0.85 * (prov - b2) + Math.min(0.5 * ssb, 0.5 * (b2 - b1)));
    }

    const totalIncome = incomeExSS + ssTaxable;
    const agiBeforeSL = totalIncome - adjExSL;
    let studentLoan = 0;
    if (!mfs && i.studentLoan > 0) {
      const [lo, hi] = FED.studentLoan[grp];
      const f = agiBeforeSL <= lo ? 1 : agiBeforeSL >= hi ? 0 : (hi - agiBeforeSL) / (hi - lo);
      studentLoan = Math.min(i.studentLoan, FED.studentLoan.cap) * f;
    }
    const adjustments = adjExSL + studentLoan;
    const agi = totalIncome - adjustments;

    // 标准扣除
    const boxes = (i.self65 ? 1 : 0) + (i.selfBlind ? 1 : 0) + (joint ? (i.spouse65 ? 1 : 0) + (i.spouseBlind ? 1 : 0) : 0);
    const fedStd = FED.std[s] + boxes * FED.stdAddl[s];

    // 分项扣除
    const fedMedical = pos(i.medical - 0.075 * agi);
    const saltRaw = i.caWithheld + i.sdiWithheld + i.caEstPaid + i.priorCAPaid + i.propertyTax + i.vlf;
    const capBase = mfs ? FED.saltCapMfs : FED.saltCap;
    const capFloor = mfs ? FED.saltFloorMfs : FED.saltFloor;
    const capPhase = mfs ? FED.saltPhaseMfs : FED.saltPhase;
    const saltCap = Math.max(capFloor, capBase - 0.3 * pos(agi - capPhase));
    const fedSalt = Math.min(saltRaw, saltCap);
    const fedMortLimit = (i.mortgagePre2018 ? 1000000 : 750000) / (mfs ? 2 : 1);
    // 2018 年起联邦只允许购房、建房、装修用途的房贷利息（HELOC 买车等不能扣）
    const fedAcqInt = pos(i.mortgageInt - i.helocInt);
    const fedMortgage = i.mortgageBal > fedMortLimit ? fedAcqInt * fedMortLimit / i.mortgageBal : fedAcqInt;
    const fedCharity = Math.min(i.charity, 0.6 * agi);
    const fedItemized = fedMedical + fedSalt + fedMortgage + fedCharity;
    const fedItemizes = fedItemized > fedStd;
    const fedDeduction = fedItemizes ? fedItemized : fedStd;

    // 2025 新增扣除（无论是否分项都可扣）
    let seniorDed = 0, tipsDed = 0, otDed = 0, carDed = 0;
    if (!mfs) {
      const seniors = (i.self65 ? 1 : 0) + (joint && i.spouse65 ? 1 : 0);
      seniorDed = seniors * pos(FED.seniorDed - 0.06 * pos(agi - FED.seniorPhase[grp]));
      const tipsOtExcess = pos(agi - FED.tipsOtPhase[grp]);
      tipsDed = pos(Math.min(i.tips, FED.tipsCap) - 0.1 * tipsOtExcess);
      otDed = pos(Math.min(i.overtime, FED.otCap[grp]) - 0.1 * tipsOtExcess);
    } else if (i.tips || i.overtime || i.self65) {
      warn.push('已婚分开申报 (MFS) 不能享受 2025 新增的小费、加班费和老年人扣除。');
    }
    carDed = pos(Math.min(i.carLoanInt, FED.carCap) - 0.2 * pos(agi - FED.carPhase[grp]));
    const newDeds = seniorDed + tipsDed + otDed + carDed;

    const tiBeforeQBI = pos(agi - fedDeduction - newDeds);
    const qbi = pos(i.seProfit - halfSE - seHealth);
    let qbiDed = 0;
    if (qbi > 0) {
      if (tiBeforeQBI <= FED.qbiThr[grp]) qbiDed = Math.min(0.2 * qbi, 0.2 * pos(tiBeforeQBI - qd - prefLTCG));
      else warn.push(`应税所得超过 QBI 门槛 ${fmt(FED.qbiThr[grp])}，199A 扣除受工资/资产和专业服务业限制，本工具未计算（按 0 处理，结果偏保守）。`);
    }
    const fedTaxable = pos(tiBeforeQBI - qbiDed);

    // 合格股息与资本利得工作表
    const pref = Math.min(fedTaxable, qd + prefLTCG);
    const ordinary = fedTaxable - pref;
    const ordTax = bracketTax(ordinary, FED.brackets[s], RATES_FED);
    const amt0 = Math.min(pref, pos(FED.ltcg0[s] - ordinary));
    const amt15 = Math.min(pref - amt0, pos(FED.ltcg15[s] - ordinary - amt0));
    const amt20 = pref - amt0 - amt15;
    const prefTax = 0.15 * amt15 + 0.20 * amt20;
    const regTax = bracketTax(fedTaxable, FED.brackets[s], RATES_FED).tax;
    const fedIncomeTax = Math.min(ordTax.tax + prefTax, regTax);

    // 子女税收抵免
    const ctcTotal = kids * FED.ctc + otherDeps * FED.odc;
    const ctcReduce = 50 * Math.ceil(pos(agi - FED.ctcPhase[grp]) / 1000);
    const ctcAllowed = pos(ctcTotal - ctcReduce);
    const fedNonrefAvail = ctcAllowed + i.fedOtherCredits;
    // ---------- 联邦 AMT（Form 6251） ----------
    const amtTax = (x) => {                           // 第 7 / 18 行：26% / 28%
      const b = FED.amt.bracket[s];
      return x <= b ? 0.26 * x : 0.28 * x - 0.02 * b;
    };
    const f6251 = {
      l1b: agi - (fedDeduction + qbiDed + newDeds - seniorDed),     // 应税所得 + 老年人扣除加回
      l2a: fedItemizes ? fedSalt : fedStd,                           // 州税（或标准扣除）加回
      l2g: i.pabInt,                                                 // 私人活动债券利息
      l2i: i.isoSpread,                                              // ISO 行权价差
      l3: i.fedAmtOther,
    };
    f6251.l4 = f6251.l1b + f6251.l2a + f6251.l2g + f6251.l2i + f6251.l3;
    if (mfs && f6251.l4 > FED.amt.mfsAddThr) f6251.l4 += Math.min(0.25 * (f6251.l4 - FED.amt.mfsAddThr), FED.amt.mfsAddMax);
    f6251.l5 = pos(FED.amt.exemption[s] - 0.25 * pos(f6251.l4 - FED.amt.phase[s]));
    f6251.l6 = pos(f6251.l4 - f6251.l5);
    // 第 III 部分：合格股息和长期资本利得仍按 0 / 15 / 20%
    const prefAll = qd + prefLTCG;
    if (f6251.l6 > 0 && prefAll > 0) {
      const l12 = f6251.l6, l13 = prefAll, l16 = Math.min(l12, l13), l17 = l12 - l16, l18 = amtTax(l17);
      const l20 = pos(fedTaxable - prefAll);
      const l21 = pos(FED.ltcg0[s] - l20), l22 = Math.min(l12, l13), l23 = Math.min(l21, l22), l24 = l22 - l23;
      const l29 = pos(FED.ltcg15[s] - (l21 + l20)), l30 = Math.min(l24, l29), l31 = 0.15 * l30;
      const l33 = l22 - (l23 + l30), l34 = 0.20 * l33;
      const l40 = l18 + l31 + l34;
      f6251.partIII = { l16, l17, l18, l23, l30, l31, l33, l34, l40 };
      f6251.l7 = Math.min(l40, amtTax(l12));
    } else {
      f6251.l7 = amtTax(f6251.l6);
    }
    f6251.l9 = f6251.l7;                                             // 不计算外国税收抵免
    f6251.l10 = fedIncomeTax;
    const fedAmt = pos(f6251.l9 - f6251.l10);
    f6251.l11 = fedAmt;

    // 子女抵免等不可退抵免可以抵 AMT（1040 第 18 行 = 第 16 + 17 行）
    const fedNonref = Math.min(fedNonrefAvail, fedIncomeTax + fedAmt);
    const ctcUsed = Math.min(ctcAllowed, fedIncomeTax + fedAmt);
    const earned = W + i.seProfit - halfSE;
    const actc = Math.min(pos(ctcAllowed - ctcUsed), kids * FED.ctcRefundable, 0.15 * pos(earned - 2500));

    // EITC
    const invIncome = pos(i.taxableInt + i.caMuniInt + i.otherMuniInt + i.ordDiv + pos(netCap) + pos(i.rental));
    let eitc = 0;
    if (!mfs && invIncome <= FED.eitcInvLimit && earned > 0) {
      const k = Math.min(kids, 3);
      const p = FED.eitc[k];
      const start = FED.eitcPhaseStart[k ? 'kids' : 'none'][grp];
      const f = (x) => pos(Math.min(p.rate * x, p.max) - p.phaseRate * pos(x - start));
      const noKidOk = k > 0 || !i.self65;
      if (noKidOk) eitc = agi >= start ? Math.min(f(earned), f(agi)) : f(earned);
    }

    const addlMedBase = W + seBase;
    const addlMed = 0.009 * pos(addlMedBase - FED.addlMedThr[s]);
    const addlMedWithheld = 0.009 * pos(W - 200000);
    const nii = pos(i.taxableInt + i.ordDiv + capIncome + i.rental);
    const niit = 0.038 * Math.min(nii, pos(agi - FED.niitThr[s]));
    const fedTotalTax = pos(fedIncomeTax + fedAmt - fedNonref) + seTax + addlMed + niit;
    const fedPayments = i.fedWithheld + i.fedEst + addlMedWithheld + actc + eitc;
    const fedRefund = fedPayments - fedTotalTax;

    // ---------- 加州 ----------
    const caSub = {
      ssTaxable,
      unemployment: i.unemployment,
      treasury: Math.min(i.treasuryInt, i.taxableInt),
    };
    const caAdd = {
      hsa: i.hsa,
      hsaEmployer: i.box12W,
      otherMuni: i.otherMuniInt,
    };
    const caSubTotal = caSub.ssTaxable + caSub.unemployment + caSub.treasury;
    const caAddTotal = caAdd.hsa + caAdd.hsaEmployer + caAdd.otherMuni;
    const caAGI = agi - caSubTotal + caAddTotal;

    const caStd = CA.std[s];
    const caMedical = pos(i.medical - 0.075 * caAGI);
    const caTaxesDed = i.propertyTax + i.vlf;            // 州所得税与 SDI 不可扣，财产税不设上限
    const caMortLimit = CA.mortgageLimit / (mfs ? 2 : 1);
    const caMortgage = i.mortgageBal > caMortLimit ? i.mortgageInt * caMortLimit / i.mortgageBal : i.mortgageInt;
    const caCharity = Math.min(i.charity, 0.5 * caAGI);
    const caMisc = pos(i.caMisc - 0.02 * caAGI);
    const caItemizedPre = caMedical + caTaxesDed + caMortgage + caCharity + caMisc;
    const thr = CA.phaseThr[s];
    // 高收入递减按联邦 AGI（540 / 540NR 第 13 行）比较
    const caItemLimit = agi > thr ? Math.min(0.06 * (agi - thr), 0.8 * (caItemizedPre - caMedical)) : 0;
    const caItemized = pos(caItemizedPre - caItemLimit);
    const caItemizes = caItemized > caStd;
    const caDeduction = caItemizes ? caItemized : caStd;
    const caTaxable = pos(caAGI - caDeduction);
    const caBr = bracketTax(caTaxable, CA.brackets[s], RATES_CA);
    const caTax = caBr.tax;

    // 免税额抵免（含高收入递减）
    const personalN = joint || s === 'qss' ? 2 : 1;
    const seniorN = (i.self65 ? 1 : 0) + (joint && i.spouse65 ? 1 : 0);
    const blindN = (i.selfBlind ? 1 : 0) + (joint && i.spouseBlind ? 1 : 0);
    const depN = kids + otherDeps;
    const step = mfs ? 1250 : 2500;
    const exReduce = agi > thr ? 6 * Math.ceil((agi - thr) / step) : 0;
    const exPersonal = (personalN + seniorN + blindN) * pos(CA.personalCredit - exReduce);
    const exDependent = depN * pos(CA.dependentCredit - exReduce);
    const exemption = exPersonal + exDependent;

    // ---------- 居民身份：全年居民 540；部分年份居民或非居民 540NR ----------
    const residency = i.caResidency || 'full';
    const months = residency === 'full' ? 12 : residency === 'non' ? 0 : Math.min(11, Math.max(1, Math.round(i.caMonths || 6)));
    let nr = null;
    let caLineTax = caTax;            // 抵免前的加州税额（540 第 31 行 / 540NR 第 37 行）
    let caTaxableFinal = caTaxable;   // 540 第 19 行 / 540NR 第 35 行
    let exAllowed = exemption;
    let eitcFactor = 1;
    // CalEITC 劳动所得按加州口径（W-2 box 16 + 自雇净收入 − 半个自雇税）
    let caEarned = (i.caWages || W + i.box12W) + i.seProfit - halfSE;
    if (residency !== 'full') {
      // Schedule CA (540NR) 第 II 部分：D 栏 = 全部收入（按加州法律），E 栏 = 计入加州的部分
      const p = months / 12;
      const tot = {
        wages: W + i.box12W,
        invest: i.taxableInt - caSub.treasury + i.otherMuniInt + i.ordDiv + capIncome,
        se: i.seProfit, rental: i.rental, retire: i.retirement, other: i.otherInc,
      };
      const keyMap = { wages: 'nrWages', invest: 'nrInvest', se: 'nrSE', rental: 'nrRental', retire: 'nrRetire', other: 'nrOther' };
      const src = {}, how = {};
      for (const k in tot) {
        const key = keyMap[k];
        if (typeof vals[key] === 'number') { src[k] = vals[key]; how[k] = 'input'; }
        else if (k === 'wages' && i.caWages) { src[k] = i.caWages; how[k] = 'box16'; }
        else { src[k] = tot[k] * p; how[k] = 'months'; }
      }
      const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
      const incomeTot = sum(tot), incomeSrc = sum(src);
      const adjCA = halfSE + seHealth + i.ira + studentLoan;   // 加州不认 HSA
      const adjSrc = incomeTot > 0 ? adjCA * Math.min(1, pos(incomeSrc / incomeTot)) : 0;
      const srcAGI = incomeSrc - adjSrc;
      const round4 = (x) => Math.round(x * 10000) / 10000;
      const dedPct = caAGI > 0 ? round4(Math.min(1, pos(srcAGI / caAGI))) : 0;       // Part IV 第 3 行
      const dedProrated = caDeduction * dedPct;
      const nrTaxable = pos(srcAGI - dedProrated);                                      // 540NR 第 35 行
      const rate = caTaxable > 0 ? round4(caTax / caTaxable) : 0;                       // 第 36 行
      const nrTax = nrTaxable * rate;                                                   // 第 37 行
      const exPct = caTaxable > 0 ? round4(Math.min(1, nrTaxable / caTaxable)) : 0;     // 第 38 行
      exAllowed = exemption * exPct;                                                    // 第 39 行
      caLineTax = nrTax;
      caTaxableFinal = nrTaxable;
      eitcFactor = exPct;
      const seShare = i.seProfit ? src.se / i.seProfit : 0;
      caEarned = src.wages + src.se - halfSE * seShare;
      nr = { months, p, tot, src, how, incomeTot, incomeSrc, adjCA, adjSrc, srcAGI, dedPct, dedProrated,
             totalTaxable: caTaxable, taxOnTotal: caTax, rate, taxable: nrTaxable, tax: nrTax, exPct, exFull: exemption };
    }

    // 租房抵免：须在加州住满 6 个月；540NR 也不按比例打折
    const renterOk = i.caRenter && caAGI <= CA.renter.limit[s] && months >= 6;
    const renter = renterOk ? CA.renter.amount[s] : 0;
    // ---------- 加州 AMT（Schedule P） ----------
    // Part I：在加州应税所得基础上加回 AMT 不允许的扣除和调整项
    const pI = {
      l1: caItemizes ? 0 : caStd,                                           // 标准扣除
      l2: caItemizes ? Math.min(fedMedical, 0.025 * agi) : 0,               // 医疗费（AMT 门槛 10%）
      l3: caItemizes ? caTaxesDed : 0,                                      // 房产税等
      l4: caItemizes ? Math.min(i.helocInt, caMortgage) : 0,                // 非购房用途的房贷利息
      l5: caItemizes ? caMisc : 0,                                          // 杂项扣除
      l10: i.isoSpread,                                                     // ISO 行权价差
      l13: i.amtOther,                                                      // 其他调整与优惠项
    };
    pI.l14 = pI.l1 + pI.l2 + pI.l3 + pI.l4 + pI.l5 + pI.l10 + pI.l13;
    pI.l15 = caTaxable > 0 ? caTaxable : caAGI - caDeduction;
    // 合格纳税人（所有生意总收入 < $100 万）从 AMTI 中排除生意收入
    const bizIncome = pos(i.seProfit - halfSE - seHealth);
    pI.l17 = bizIncome;
    pI.l18 = caItemizes ? -caItemLimit : 0;                                 // AMT 不适用分项扣除递减
    pI.l21 = pI.l14 + pI.l15 - pI.l17 + pI.l18;
    if (mfs && pI.l21 > CA.amt.mfsAddThr) pI.l21 += Math.min(0.25 * (pI.l21 - CA.amt.mfsAddThr), CA.amt.mfsAddMax);
    const amtEx = pos(CA.amt.exemption[s] - 0.25 * pos(pI.l21 - CA.amt.phase[s]));
    const amtBase = pos(pI.l21 - amtEx);
    const tmt = CA.amt.rate * amtBase;
    let amtNR = null, cmpTMT = tmt, amt;
    if (nr) {
      // Schedule P (540NR) 第 25–45 行：按加州来源部分折算
      const round4a = (x) => Math.round(x * 10000) / 10000;
      const seShare = i.seProfit ? nr.src.se / i.seProfit : 0;
      const l25 = nr.srcAGI;
      const l27 = bizIncome * seShare;
      const isoCA = typeof vals.nrIso === 'number' ? vals.nrIso : pI.l10 * nr.p;
      const l29 = isoCA + pI.l13 * nr.dedPct;
      const l32 = l25 - l27 + l29;
      let l33 = 0, l34 = 0, l35 = 0, l37 = 0, l38 = 0, l39 = 0;
      if (caItemizes) {
        l33 = caItemizedPre;
        l34 = -(pI.l2 + pI.l3 + pI.l4 + pI.l5);
        l35 = l33 + l34;
        l37 = l35 + pI.l21;
        l38 = l37 > 0 ? round4a(Math.min(1, pos(l32 / l37))) : 0;
        l39 = l35 * l38;
      }
      const l40 = pos(l32 - l39);
      const l42 = pI.l21 > 0 ? round4a(tmt / pI.l21) : 0;
      const l43 = l40 * l42;
      amtNR = { l25, l27, isoCA, l29, l32, l33, l34, l35, l36: pI.l21, l37, l38, l39, l40, l41: tmt, l42, l43, l44: nr.tax };
      cmpTMT = l43;
      amt = pos(l43 - nr.tax);
    } else {
      amt = pos(tmt - caTax);                                               // 第 26 行 = TMT − 540 第 31 行
    }

    // 抵免顺序（Schedule P 第 III 部分）：免税额抵免 → A 类只能抵超过 TMT 的部分 → 租房抵免、Schedule S 可抵到 TMT 以下
    const afterEx = pos(caLineTax - exAllowed);
    const excessTax = pos(afterEx - cmpTMT);
    const otherAllowed = Math.min(i.caOtherCredits, excessTax);
    const renterAllowed = Math.min(renter, afterEx - otherAllowed);
    const caNonrefBasic = Math.min(exAllowed, caLineTax) + otherAllowed + renterAllowed;

    // Schedule S：每个州单独算，取“加州税 × 双重征税收入 / 加州 AGI”与“外州税 × 双重征税收入 / 外州 AGI”较小者
    const sLine2 = pos(caLineTax - caNonrefBasic);            // 540 第 48 行 / 540NR 第 63 行（未计其他州抵免）
    const sLine4 = nr ? nr.srcAGI : caAGI;                    // 540 第 17 行 / 540NR 第 32 行
    const round4s = (x) => Math.round(x * 10000) / 10000;
    const ostcRows = (Array.isArray(vals.ostc) ? vals.ostc : []).map((row) => {
      const st = row.state || '';
      const caInc = n(row.caIncome), otherInc = n(row.otherIncome) || n(row.caIncome);
      const otherAGI = n(row.otherAGI) || otherInc;
      const otherTax = n(row.otherTax);
      const elig = ostcEligibility(st, residency);
      const r5 = sLine4 > 0 ? round4s(Math.min(1, pos(caInc / sLine4))) : 0;
      const l6 = sLine2 * r5;
      const r10 = otherAGI > 0 ? round4s(Math.min(1, pos(otherInc / otherAGI))) : 0;
      const l11 = otherTax * r10;
      const credit = elig.ok ? Math.min(l6, l11) : 0;
      return { idx: row.idx, state: st, name: STATE_NAMES[st] || st, ...elig, line2: sLine2, line3: caInc, line4: sLine4, line5: r5, line6: l6,
               line7: otherTax, line8: otherInc, line9: otherAGI, line10: r10, line11: l11, credit };
    }).filter((x) => x.state || x.line3 || x.line7);
    const ostcSum = ostcRows.reduce((a, x) => a + x.credit, 0);
    const ostc = Math.min(ostcSum, sLine2);
    const caNonref = caNonrefBasic + ostc;
    // 行为健康服务税（原心理健康服务税）：540NR 按加州应税所得计算，抵免不能抵减
    const mhst = 0.01 * pos(caTaxableFinal - CA.mhstThr);
    const caTaxAfter = pos(caLineTax - caNonref) + amt + mhst;

    const caInv = invIncome;
    const eitcKids = Math.min(kids, 3);
    // 部分年份居民须在加州住超过半年才可领 CalEITC / YCTC，金额乘以免税额抵免比例（FTB 3514 第 21、29 行）
    const calEitcEligible = caEarned > 0 && caEarned <= CA.caleitc.earnedMax && caInv <= CA.caleitc.invLimit && !mfs && months > 6;
    let calEitcByEarned = 0, calEitcByAGI = null, calEitc = 0;
    if (calEitcEligible) {
      calEitcByEarned = calEitcLookup(caEarned, eitcKids);
      calEitc = calEitcByEarned;
      if (calEitc > 0 && Math.round(agi) !== Math.round(caEarned) && agi >= CA.caleitc.agiCheck[eitcKids]) {
        calEitcByAGI = calEitcLookup(agi, eitcKids);
        calEitc = Math.min(calEitc, calEitcByAGI);
      }
    }
    let yctc = 0;
    if (calEitc > 0 && kidsU6 > 0) {
      const y = CA.yctc;
      yctc = caEarned <= y.phaseStart ? y.max : y.max * pos(y.phaseEnd - caEarned) / (y.phaseEnd - y.phaseStart);
    }
    const calEitcFull = calEitc, yctcFull = yctc;
    calEitc *= eitcFactor;
    yctc *= eitcFactor;
    const caPayments = i.caWithheld + i.caEst + calEitc + yctc;
    const caRefund = caPayments - caTaxAfter;

    // SDI
    const caWages = i.caWages || W + i.box12W;
    const sdiExpected = CA.sdiRate * caWages;

    // 2026 预缴税建议
    const est = estimatePlan({ s, mfs, fedTotalTax, fedRefund, agi, fedWithheld: i.fedWithheld + addlMedWithheld, caTaxAfter, caRefund, caAGI, caWithheld: i.caWithheld });

    ostcRows.filter((x) => !x.ok).forEach((x) => warn.push(`Schedule S：${x.name || '未选州'} 不能抵免。${x.reason}。`));
    ostcRows.filter((x) => x.ok && x.caveat).forEach((x) => warn.push(`Schedule S（${x.name}）：${x.caveat}。`));
    if (ostcRows.some((x) => x.ok)) warn.push('申请其他州税收抵免要随加州报税表附上 Schedule S 和外州报税表副本。外州的税要先算出来（外州报税表上抵免后的净税额），不含城市、县、联邦或外国的税。');
    if (ostcSum > sLine2 + 0.5) warn.push(`各州抵免合计 ${fmt(ostcSum)} 超过可抵的加州税 ${fmt(sLine2)}，按上限计算。`);
    if (nr) {
      const names = { wages: '工资', invest: '利息/股息/资本利得', se: '自雇收入', rental: '出租收入', retire: '退休金', other: '其他收入' };
      const est = Object.keys(nr.how).filter((k) => nr.how[k] === 'months' && nr.tot[k]);
      if (est.length) warn.push(`540NR：${est.map((k) => names[k]).join('、')}没有填写计入加州的金额，已按居住 ${months} 个月 / 12 估算。实际应按收入发生时是否为加州居民、来源地是否在加州填写（第 2 步“540NR 加州部分”）。`);
      if (residency === 'non' && nr.tot.retire) warn.push('非居民的退休金、IRA 提款受联邦法律保护，加州不能征税（4 U.S.C. §114）。');
      if (i.caRenter && months < 6) warn.push('租房抵免要求 2025 年至少有 6 个完整月是加州居民，你不符合。');
      if (months <= 6 && caEarned > 0 && caEarned <= CA.caleitc.earnedMax) warn.push('CalEITC 和 YCTC 要求一年中超过半年住在加州，你不符合。');
      warn.push('540NR 的税额 = 加州来源应税所得 × 按全年总收入计算的平均税率，所以来自外州的收入会推高你在加州的税率。');
    }
    if (i.rental < 0) warn.push('出租房净亏损受被动亏损规则限制（MAGI 10 万以上开始减少 $25,000 特别额度），本工具按全额抵扣，可能偏低。');
    if (fedAmt > 0) warn.push(`你需要缴纳联邦 AMT ${fmt(fedAmt)}（Form 6251 第 11 行，填在 Schedule 2 第 1 行）。ISO 等“时间差”项目产生的 AMT 以后年度可用 Form 8801 抵免拿回。`);
    if (i.helocInt && i.mortgageInt) warn.push(`联邦 2018 年起不能扣非购房用途的房贷利息，${fmt(Math.min(i.helocInt, i.mortgageInt))} 已从联邦扣除中去掉；加州仍允许扣（AMT 时加回）。`);
    if (amt > 0) warn.push(`你需要缴纳加州 AMT ${fmt(amt)}（Schedule P 第 26 行，填在 ${nr ? '540NR 第 71 行' : '540 第 61 行'}）。行使 ISO 产生的 AMT 以后年度可能通过 FTB 3510 抵免拿回。`);
    if (i.caOtherCredits > otherAllowed + 0.5) warn.push(`其他加州抵免 ${fmt(i.caOtherCredits)} 中只有 ${fmt(otherAllowed)} 能用：育儿费用等抵免不能把税抵到暂定最低税（TMT）以下。`);
    if (bizIncome > 0) warn.push('AMT 计算假设你的生意总收入低于 $100 万，按合格纳税人把自雇收入排除在 AMTI 之外（Schedule P 第 17 行）。');
    if (i.isoSpread && !amt) warn.push(`ISO 价差 ${fmt(i.isoSpread)} 没有触发加州 AMT：暂定最低税 ${fmt(cmpTMT)} 低于正常税额。`);
    if (residency === 'full' && i.caWages && Math.abs(i.caWages - (W + i.box12W)) > 1 && !i.box12W) warn.push('W-2 第 16 栏（加州工资）与第 1 栏不同。常见原因是 HSA 供款，请检查第 12 栏 W 代码并填入。');
    if (i.sdiWithheld && Math.abs(i.sdiWithheld - sdiExpected) > Math.max(20, 0.05 * sdiExpected)) {
      warn.push(`SDI 扣缴 ${fmt(i.sdiWithheld)} 与 1.2% × 加州工资 = ${fmt(sdiExpected)} 不一致。2024 年起 SDI 不设工资上限，多份工作不会多扣，差额通常是雇主算错，应找雇主更正，不能在报税表上退回。`);
    }
    if (calEitc > 0) {
      warn.push(`已按 FTB 3514 查表计入加州 CalEITC ${fmt(calEitc)}。要领取需随 540 附上 FTB 3514，并满足：有 SSN 或 ITIN、全年过半时间住在加州、无子女时年满 18 岁、子女与你同住加州超过半年。`);
    } else if (mfs && caEarned > 0 && caEarned <= CA.caleitc.earnedMax) {
      warn.push('已婚分开申报一般不能领 CalEITC，但如果和配偶分居超过 6 个月且有同住子女，可以按特殊规则申请（FTB 3514 第 4 步）。');
    } else if (caEarned > 0 && caEarned <= CA.caleitc.earnedMax && caInv > CA.caleitc.invLimit) {
      warn.push(`投资收入 ${fmt(caInv)} 超过 CalEITC 上限 ${fmt(CA.caleitc.invLimit)}，不能领取 CalEITC 和 YCTC。`);
    }

    return {
      status: s,
      fed: {
        wages: W, taxableInt: i.taxableInt, taxExemptInt: i.caMuniInt + i.otherMuniInt, ordDiv: i.ordDiv, qualDiv: qd,
        capIncome, seProfit: i.seProfit, rental: i.rental, unemployment: i.unemployment, retirement: i.retirement,
        otherInc: i.otherInc, ssBenefits: ssb, ssTaxable, totalIncome,
        halfSE, seHealth, ira: i.ira, hsa: i.hsa, studentLoan, adjustments, agi,
        std: fedStd, itemized: fedItemized, itemizes: fedItemizes, deduction: fedDeduction,
        medical: fedMedical, saltRaw, saltCap, salt: fedSalt, mortgage: fedMortgage, charity: fedCharity,
        seniorDed, tipsDed, otDed, carDed, newDeds, qbiDed, taxable: fedTaxable,
        ordinary, pref, amt0, amt15, amt20, incomeTax: fedIncomeTax, brackets: ordTax.rows,
        ctcAllowed, ctcUsed, nonref: fedNonref, actc, eitc, amt: fedAmt, f6251,
        seTax, addlMed, niit, totalTax: fedTotalTax,
        withheld: i.fedWithheld, est: i.fedEst, addlMedWithheld, payments: fedPayments, refund: fedRefund,
        marginal: marginalRate(ordinary, FED.brackets[s], RATES_FED),
        effective: agi > 0 ? fedTotalTax / agi : 0,
      },
      ca: {
        fedAGI: agi, sub: caSub, add: caAdd, subTotal: caSubTotal, addTotal: caAddTotal, agi: caAGI,
        std: caStd, medical: caMedical, taxesDed: caTaxesDed, mortgage: caMortgage, charity: caCharity, misc: caMisc,
        itemizedPre: caItemizedPre, itemLimit: caItemLimit, itemized: caItemized, itemizes: caItemizes, deduction: caDeduction,
        residency, months, nr, totalTaxable: caTaxable, lineTax: caLineTax, exAllowed,
        taxable: caTaxableFinal, tax: caTax, brackets: caBr.rows, mhst,
        personalN, seniorN, blindN, depN, exReduce, exPersonal, exDependent, exemption, phaseThr: thr,
        renter, renterLimit: CA.renter.limit[s], renterAsked: !!i.caRenter,
        ostc, ostcRows, ostcSum, sLine2,
        amt, tmt, cmpTMT, amtEx, amtBase, pI, amtNR, otherAllowed, renterAllowed, excessTax, afterEx,
        nonref: caNonref, totalTax: caTaxAfter,
        yctc, yctcFull, calEitcFull, eitcFactor, calEitcEligible, calEitc, calEitcByEarned, calEitcByAGI, eitcKids, earned: caEarned, inv: caInv,
        calEitcMax: CALEITC_TABLE.map((c) => Math.max(...c)),
        withheld: i.caWithheld, est: i.caEst, payments: caPayments, refund: caRefund,
        caWages, sdiExpected, sdiWithheld: i.sdiWithheld,
        marginal: marginalRate(caTaxable, CA.brackets[s], RATES_CA) + (caTaxableFinal > CA.mhstThr ? 0.01 : 0),
        effective: (nr ? nr.srcAGI : caAGI) > 0 ? caTaxAfter / (nr ? nr.srcAGI : caAGI) : 0,
      },
      est,
      warnings: warn,
    };
  }

  function estimatePlan(o) {
    const out = { fed: null, ca: null };
    const fedOwe = -o.fedRefund;
    if (fedOwe >= 1000) {
      const pct = o.agi > (o.mfs ? 75000 : 150000) ? 1.10 : 1.00;
      const need = pos(o.fedTotalTax * pct - o.fedWithheld);
      const dates = ['2026-04-15', '2026-06-15', '2026-09-15', '2027-01-15'];
      out.fed = { pct, annual: need, rows: dates.map((d) => [d, 0.25, need * 0.25]) };
    }
    const caOwe = -o.caRefund;
    if (caOwe >= (o.mfs ? 250 : 500)) {
      let basis, label;
      if (o.caAGI >= 1000000) { basis = o.caTaxAfter * 0.90; label = '加州 AGI ≥ $100 万，只能用当年税额 90%（这里用 2025 税额代替 2026 预估）'; }
      else if (o.caAGI > (o.mfs ? 75000 : 150000)) { basis = o.caTaxAfter * 1.10; label = '上年税额的 110%（加州 AGI > $15 万）'; }
      else { basis = o.caTaxAfter; label = '上年税额的 100%'; }
      const need = pos(basis - o.caWithheld);
      out.ca = { label, annual: need, rows: CA.estSchedule.map(([d, p]) => [d, p, need * p]) };
    }
    return out;
  }

  function fmt(x) {
    const v = Math.round(x);
    return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US');
  }

  const api = { compute, calEitcLookup, ostcEligibility, STATE_NAMES, OSTC, bracketTax, marginalRate, fmt, FED, CA, RATES_FED, RATES_CA, r2 };
  root.TaxEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
