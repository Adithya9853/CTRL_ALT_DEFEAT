/* FINDORA quick-match rules — shared by the browser and the server.
   Used as an offline fallback and to pick the best candidates before AI reviews them. */
(function (root) {
  const CATS = {"ID Card":"🪪","Earphones":"🎧","Bottle":"🧴","Calculator":"🧮","Phone":"📱","Wallet":"👛","Keys":"🔑","Bag":"🎒","Books & Notes":"📚","Laptop / Charger":"💻","Clothing":"🧥","Umbrella":"☂️","Spectacles":"👓","Watch":"⌚","Other":"📦"};
  const COLORS = ["Black","White","Blue","Red","Green","Yellow","Grey","Silver","Gold","Brown","Pink","Purple","Orange","Multi-colour","Not sure"];
  const PLACES = {
    "Academic Blocks":["Main Block","Library","CSE Block","Mechanical Block","Seminar Hall","Labs"],
    "Food & Hangout":["Canteen","Food Court","Juice Stall"],
    "Sports":["Ground","Indoor Stadium","Gym"],
    "Hostel & Transport":["Boys Hostel","Girls Hostel","College Bus","Bus Stop","Parking"],
    "Other":["Main Gate","Auditorium","Other place"]
  };
  const DEPTS = ["CSE","ISE","AI & ML","AI & DS","ECE","EEE","Mechanical","Civil","MBA","MCA","Staff","Other"];
  const ALL_PLACES = Object.values(PLACES).flat();
  const zoneOf = p => Object.keys(PLACES).find(z => PLACES[z].includes(p)) || "";
  const ACTIVE = s => s !== "Returned" && s !== "Removed";

  const SYN = [
    ["earphone","earbud","airpod","headphone","headset","tws","bud","neckband","earpod"],
    ["bottle","flask","sipper","tumbler","milton","thermos"],
    ["id","idcard","identity","icard","card","lanyard"],
    ["calculator","calci","casio","fx991","fx991es"],
    ["phone","mobile","smartphone","iphone","android","cell"],
    ["wallet","purse","pouch"],["key","keychain","keyring"],
    ["bag","backpack","sling","handbag","tote"],
    ["book","notebook","note","textbook","record","diary"],
    ["laptop","charger","adapter","cable","macbook"],
    ["jacket","hoodie","sweater","sweatshirt","coat","shirt"],
    ["umbrella"],["spectacle","glasses","specs","sunglasses","goggle"],["watch","smartwatch","band"],
    ["sticker","decal"],["scratch","dent","crack","broken"],["case","cover","box"],
    ["black","dark"],["grey","gray"],["silver","steel","metal","metallic"]
  ];
  const SYNMAP = {}; SYN.forEach(g => g.forEach(w => SYNMAP[w] = g[0]));
  const STOP = new Set("a an the and or of in on at to with my is it its was near i lost found have has this that for from small big very some one left".split(" "));
  function tokens(t) {
    return String(t || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
      .filter(w => w && !STOP.has(w))
      .map(w => w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w)
      .map(w => SYNMAP[w] || w);
  }
  function quickCompare(a, b) {
    const same = [], diff = []; let score = 0;
    if (a.cat === b.cat) { score += 30; same.push("Same category (" + a.cat + ")"); } else diff.push("Different category: " + a.cat + " vs " + b.cat);
    const ta = new Set(tokens(a.title + " " + a.desc)), tb = new Set(tokens(b.title + " " + b.desc));
    const common = [...ta].filter(w => tb.has(w));
    score += Math.min(1, common.length / Math.max(1, Math.min(ta.size, tb.size)) * 1.6) * 35;
    if (common.length) same.push("Similar words: " + common.slice(0, 4).join(", "));
    if (a.color === b.color && a.color !== "Not sure") { score += 10; same.push("Same colour (" + a.color + ")"); }
    else if (a.color !== "Not sure" && b.color !== "Not sure") diff.push("Colour: " + a.color + " vs " + b.color);
    if (a.loc === b.loc) { score += 15; same.push("Same place (" + a.loc + ")"); }
    else if (zoneOf(a.loc) && zoneOf(a.loc) === zoneOf(b.loc)) { score += 8; same.push("Nearby places (" + zoneOf(a.loc) + ")"); }
    else diff.push("Place: " + a.loc + " vs " + b.loc);
    const lost = a.type === "lost" ? a : b, found = a.type === "lost" ? b : a;
    const days = Math.round((new Date(found.date) - new Date(lost.date)) / 86400000);
    if (days < -1) diff.push("Found " + Math.abs(days) + " days before it was lost");
    else if (days <= 2) { score += 10; same.push("Same time (within 2 days)"); }
    else if (days <= 10) { score += 5; same.push("Found " + days + " days later"); }
    else diff.push("Found " + days + " days later");
    return { score: Math.round(Math.min(100, score)), same, diff, ai: false };
  }

  const api = { CATS, COLORS, PLACES, DEPTS, ALL_PLACES, zoneOf, ACTIVE, tokens, quickCompare };
  if (typeof module === "object" && module.exports) module.exports = api; else root.FM = api;
})(this);
